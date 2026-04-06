import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import crypto from "crypto";
import { storage } from "./storage";
import {
  insertExpenseSchema, insertCategorySchema,
  insertRecurringExpenseSchema, insertAiMessageSchema,
} from "@shared/schema";
import { z } from "zod";

// In-memory token store: token -> userId
const tokenStore = new Map<string, { userId: number; expiresAt: number }>();

function generateToken(): string {
  return crypto.randomUUID() + "-" + crypto.randomUUID();
}

function createAuthToken(userId: number): string {
  const token = generateToken();
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  tokenStore.set(token, { userId, expiresAt });
  return token;
}

function getUserIdFromToken(token: string): number | null {
  const entry = tokenStore.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    tokenStore.delete(token);
    return null;
  }
  return entry.userId;
}

function removeToken(token: string): void {
  tokenStore.delete(token);
}

// Extend Request to carry userId
declare global {
  namespace Express {
    interface Request {
      userId?: number;
      authToken?: string;
    }
  }
}

// Auth middleware — extracts userId from Bearer token
function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const token = authHeader.slice(7);
  const userId = getUserIdFromToken(token);
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  req.userId = userId;
  req.authToken = token;
  next();
}

const signupSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().min(1, "Name is required"),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export function registerRoutes(server: Server, app: Express): void {
  // ===== Auth Routes =====
  app.post("/api/auth/signup", async (req, res) => {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const { email, password, name } = parsed.data;

    const existing = await storage.getUserByEmail(email);
    if (existing) return res.status(409).json({ error: "An account with this email already exists" });

    const user = await storage.createUser(email, password, name);
    const token = createAuthToken(user.id);

    res.status(201).json({ id: user.id, email: user.email, name: user.name, token });
  });

  app.post("/api/auth/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });

    const { email, password } = parsed.data;
    const user = await storage.getUserByEmail(email);
    if (!user) return res.status(401).json({ error: "Invalid email or password" });

    if (!storage.verifyPassword(password, user.password)) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = createAuthToken(user.id);
    res.json({ id: user.id, email: user.email, name: user.name, token });
  });

  app.post("/api/auth/logout", requireAuth, (req, res) => {
    if (req.authToken) removeToken(req.authToken);
    res.json({ ok: true });
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    const user = await storage.getUserById(req.userId!);
    if (!user) return res.status(401).json({ error: "User not found" });
    res.json({ id: user.id, email: user.email, name: user.name });
  });

  // ===== Categories =====
  app.get("/api/categories", requireAuth, async (req, res) => {
    res.json(await storage.getCategories(req.userId!));
  });

  app.post("/api/categories", requireAuth, async (req, res) => {
    const parsed = insertCategorySchema.safeParse({ ...req.body, userId: req.userId });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.status(201).json(await storage.createCategory(parsed.data));
  });

  app.patch("/api/categories/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const updated = await storage.updateCategory(id, req.userId!, req.body);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  });

  app.delete("/api/categories/:id", requireAuth, async (req, res) => {
    await storage.deleteCategory(parseInt(req.params.id), req.userId!);
    res.json({ ok: true });
  });

  // ===== Expenses =====
  app.get("/api/expenses", requireAuth, async (req, res) => {
    const filters: any = {};
    if (req.query.startDate) filters.startDate = req.query.startDate;
    if (req.query.endDate) filters.endDate = req.query.endDate;
    if (req.query.categoryId) filters.categoryId = parseInt(req.query.categoryId as string);
    res.json(await storage.getExpenses(req.userId!, filters));
  });

  app.get("/api/expenses/:id", requireAuth, async (req, res) => {
    const expense = await storage.getExpense(parseInt(req.params.id), req.userId!);
    if (!expense) return res.status(404).json({ error: "Not found" });
    res.json(expense);
  });

  app.post("/api/expenses", requireAuth, async (req, res) => {
    const parsed = insertExpenseSchema.safeParse({ ...req.body, userId: req.userId });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const created = await storage.createExpense(parsed.data);
    // Recalculate savings whenever an expense is added
    await storage.recalculateSavings(req.userId!);
    res.status(201).json(created);
  });

  app.patch("/api/expenses/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const updated = await storage.updateExpense(id, req.userId!, req.body);
    if (!updated) return res.status(404).json({ error: "Not found" });
    await storage.recalculateSavings(req.userId!);
    res.json(updated);
  });

  app.delete("/api/expenses/:id", requireAuth, async (req, res) => {
    await storage.deleteExpense(parseInt(req.params.id), req.userId!);
    await storage.recalculateSavings(req.userId!);
    res.json({ ok: true });
  });

  // ===== Monthly Budget + Savings =====
  app.get("/api/budget", requireAuth, async (req, res) => {
    const userId = req.userId!;
    const now = new Date();
    const month = (req.query.month as string) || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const budget = await storage.getMonthlyBudget(userId, month);
    const totals = await storage.getMonthlyTotals(userId, month);
    const savings = await storage.getSavingsBalance(userId);

    res.json({
      month,
      budget: budget?.amount || 0,
      budgetId: budget?.id || null,
      spent: totals.total,
      remaining: (budget?.amount || 0) - totals.total,
      savings,
    });
  });

  app.post("/api/budget", requireAuth, async (req, res) => {
    const userId = req.userId!;
    const { amount, month } = req.body;
    if (!amount || !month) return res.status(400).json({ error: "Amount and month required" });
    const budget = await storage.setMonthlyBudget(userId, month, parseFloat(amount));
    res.json(budget);
  });

  app.get("/api/budget/history", requireAuth, async (req, res) => {
    const userId = req.userId!;
    const budgets = await storage.getAllMonthlyBudgets(userId);
    const history = [];
    for (const b of budgets) {
      const totals = await storage.getMonthlyTotals(userId, b.month);
      const delta = b.amount - totals.total;
      history.push({
        month: b.month,
        budget: b.amount,
        spent: totals.total,
        remaining: delta,
        status: delta >= 0 ? "under" : "over",
      });
    }
    res.json(history);
  });

  app.get("/api/savings", requireAuth, async (req, res) => {
    const result = await storage.recalculateSavings(req.userId!);
    res.json(result);
  });

  // ===== Recurring Expenses =====
  app.get("/api/recurring", requireAuth, async (req, res) => {
    res.json(await storage.getRecurringExpenses(req.userId!));
  });

  app.post("/api/recurring", requireAuth, async (req, res) => {
    const parsed = insertRecurringExpenseSchema.safeParse({ ...req.body, userId: req.userId });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    res.status(201).json(await storage.createRecurringExpense(parsed.data));
  });

  app.patch("/api/recurring/:id", requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const updated = await storage.updateRecurringExpense(id, req.userId!, req.body);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  });

  app.delete("/api/recurring/:id", requireAuth, async (req, res) => {
    await storage.deleteRecurringExpense(parseInt(req.params.id), req.userId!);
    res.json({ ok: true });
  });

  // ===== Dashboard =====
  app.get("/api/dashboard", requireAuth, async (req, res) => {
    const userId = req.userId!;
    const now = new Date();
    const month = (req.query.month as string) || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const totals = await storage.getMonthlyTotals(userId, month);
    const trend = await storage.getSpendingTrend(userId, 6);
    const allExpenses = await storage.getExpenses(userId);
    const recentExpenses = allExpenses.slice(0, 5);
    const categoriesData = await storage.getCategories(userId);
    const budget = await storage.getMonthlyBudget(userId, month);
    const savings = await storage.getSavingsBalance(userId);

    res.json({
      month,
      total: totals.total,
      byCategory: totals.byCategory,
      trend,
      recentExpenses,
      categories: categoriesData,
      budget: budget?.amount || 0,
      savings,
    });
  });

  // ===== AI Chat (Groq) =====
  app.get("/api/ai/messages", requireAuth, async (req, res) => {
    res.json(await storage.getAiMessages(req.userId!));
  });

  app.post("/api/ai/chat", requireAuth, async (req, res) => {
    const userId = req.userId!;
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Message is required" });

    // Save user message
    await storage.createAiMessage({
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
      userId,
    });

    // Get context data for the AI
    const allCategories = await storage.getCategories(userId);
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthlyData = await storage.getMonthlyTotals(userId, currentMonth);
    const recentExpenses = (await storage.getExpenses(userId)).slice(0, 20);
    const budget = await storage.getMonthlyBudget(userId, currentMonth);
    const savings = await storage.getSavingsBalance(userId);
    const recurringData = await storage.getRecurringExpenses(userId);

    // Get Groq settings (with env var fallback)
    const groqApiKeySetting = await storage.getSetting("groq_api_key");
    const groqModelSetting = await storage.getSetting("groq_model");
    const currencySetting = await storage.getSetting("currency");

    const groqApiKey = groqApiKeySetting?.value || process.env.GROQ_API_KEY || "";
    const groqModel = groqModelSetting?.value || "llama-3.3-70b-versatile";
    const currency = currencySetting?.value || "JPY";

    const today = now.toISOString().split("T")[0];
    const budgetAmount = budget?.amount || 0;
    const remaining = budgetAmount - monthlyData.total;

    const systemPrompt = `You are a helpful expense tracking AI assistant. You help users manage their finances.

TODAY'S DATE: ${today}
IMPORTANT: When adding expenses, ALWAYS use today's date (${today}) unless the user explicitly mentions a different date.

AVAILABLE CATEGORIES: ${JSON.stringify(allCategories.map(c => ({ id: c.id, name: c.name })))}

CURRENT MONTH (${currentMonth}) SPENDING:
- Total: ${currency} ${monthlyData.total.toFixed(2)}
- By Category: ${JSON.stringify(monthlyData.byCategory.map(c => `${c.categoryName}: ${currency} ${c.total.toFixed(2)}`))}

MONTHLY BUDGET: ${budgetAmount > 0 ? `${currency} ${budgetAmount.toFixed(2)}` : "Not set"}
BUDGET REMAINING: ${budgetAmount > 0 ? `${currency} ${remaining.toFixed(2)}` : "N/A"}
${remaining < 0 && budgetAmount > 0 ? `⚠️ OVER BUDGET by ${currency} ${Math.abs(remaining).toFixed(2)} — this overspend is deducted from savings.` : ""}

SAVINGS BALANCE: ${currency} ${savings.toFixed(2)}
(Savings = unspent budget from past months. Cannot go below zero.)

RECENT EXPENSES: ${JSON.stringify(recentExpenses.map(e => ({ amount: e.amount, description: e.description, date: e.date, categoryId: e.categoryId })))}

RECURRING EXPENSES: ${JSON.stringify(recurringData.map(r => ({ description: r.description, amount: r.amount, frequency: r.frequency, active: r.isActive })))}

CAPABILITIES:
1. Parse natural language expense entries. When user says something like "spent $20 on lunch", respond with a JSON action block.
2. Smart categorization based on description.
3. Spending insights, budget advice, and savings analysis.

When the user wants to ADD an expense, respond with your message AND include a JSON block like:
\`\`\`action
{"type":"add_expense","amount":NUMBER,"description":"STRING","categoryId":NUMBER,"date":"YYYY-MM-DD"}
\`\`\`

When giving insights, reference the budget, remaining amount, and savings balance. Be specific with numbers. Be concise and helpful. Use ${currency} for currency.`;

    try {
      if (!groqApiKey) {
        throw new Error("Groq API key not configured");
      }

      const aiMessages = await storage.getAiMessages(userId);
      const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${groqApiKey}`,
        },
        body: JSON.stringify({
          model: groqModel,
          messages: [
            { role: "system", content: systemPrompt },
            ...aiMessages.slice(-10).map(m => ({ role: m.role, content: m.content })),
          ],
          temperature: 0.7,
          max_tokens: 1024,
        }),
      });

      if (!groqResponse.ok) {
        const errorBody = await groqResponse.text();
        throw new Error(`Groq returned ${groqResponse.status}: ${errorBody}`);
      }

      const data = await groqResponse.json() as any;
      const assistantMessage = data.choices?.[0]?.message?.content || "I couldn't generate a response.";

      // Check for action blocks
      const actionMatch = assistantMessage.match(/```action\n([\s\S]*?)\n```/);
      let actionResult = null;
      if (actionMatch) {
        try {
          const action = JSON.parse(actionMatch[1]);
          if (action.type === "add_expense") {
            let expenseDate = action.date || today;
            const parsedDate = new Date(expenseDate);
            if (isNaN(parsedDate.getTime()) || parsedDate > now) {
              expenseDate = today;
            }
            const newExpense = await storage.createExpense({
              amount: action.amount,
              description: action.description,
              categoryId: action.categoryId,
              date: expenseDate,
              userId,
            });
            // Recalculate savings after AI-added expense
            await storage.recalculateSavings(userId);
            actionResult = { type: "expense_added", expense: newExpense };
          }
        } catch (e) {
          // Action parsing failed
        }
      }

      const savedMsg = await storage.createAiMessage({
        role: "assistant",
        content: assistantMessage,
        timestamp: new Date().toISOString(),
        userId,
      });

      res.json({ message: savedMsg, action: actionResult });
    } catch (error: any) {
      // Fallback when Groq unavailable
      const fallbackMessage = await generateFallbackResponse(message, allCategories, monthlyData, recentExpenses, currency, userId, budgetAmount, savings);

      const savedMsg = await storage.createAiMessage({
        role: "assistant",
        content: fallbackMessage.text,
        timestamp: new Date().toISOString(),
        userId,
      });

      res.json({ message: savedMsg, action: fallbackMessage.action, groqError: error.message });
    }
  });

  app.delete("/api/ai/messages", requireAuth, async (req, res) => {
    await storage.clearAiMessages(req.userId!);
    res.json({ ok: true });
  });

  // ===== Settings =====
  app.get("/api/settings", requireAuth, async (_req, res) => {
    res.json(await storage.getSettings());
  });

  app.patch("/api/settings/:key", requireAuth, async (req, res) => {
    const { value } = req.body;
    if (!value) return res.status(400).json({ error: "Value required" });
    res.json(await storage.upsertSetting(req.params.key, value));
  });
}

// Fallback AI when Groq is unavailable
async function generateFallbackResponse(
  message: string,
  categories: any[],
  monthlyData: any,
  recentExpenses: any[],
  currency: string,
  userId: number,
  budget: number,
  savings: number,
) {
  const lower = message.toLowerCase();

  // Try to parse expense from natural language
  const amountMatch = lower.match(/(?:\$|¥|€|£)?(\d+(?:\.\d+)?)/);
  const hasSpendWord = /(?:spent|paid|bought|cost|expense|charge|bill)/.test(lower);

  if (amountMatch && hasSpendWord) {
    const amount = parseFloat(amountMatch[1]);
    const desc = message.replace(/(?:\$|¥|€|£)?\d+(?:\.\d+)?/, "").replace(/(?:spent|paid|bought|cost|on|for)/gi, "").trim() || "Expense";

    let categoryId = categories.find((c: any) => c.name === "Other")?.id || 1;
    if (/food|lunch|dinner|breakfast|coffee|restaurant|meal|eat/i.test(lower)) {
      categoryId = categories.find((c: any) => c.name === "Food & Dining")?.id || categoryId;
    } else if (/uber|taxi|bus|train|gas|fuel|transport/i.test(lower)) {
      categoryId = categories.find((c: any) => c.name === "Transportation")?.id || categoryId;
    } else if (/shop|buy|amazon|clothes|shoes/i.test(lower)) {
      categoryId = categories.find((c: any) => c.name === "Shopping")?.id || categoryId;
    } else if (/movie|game|netflix|spotify|entertainment/i.test(lower)) {
      categoryId = categories.find((c: any) => c.name === "Entertainment")?.id || categoryId;
    } else if (/electric|water|internet|phone|rent|bill|utility/i.test(lower)) {
      categoryId = categories.find((c: any) => c.name === "Bills & Utilities")?.id || categoryId;
    } else if (/doctor|medicine|health|gym|hospital/i.test(lower)) {
      categoryId = categories.find((c: any) => c.name === "Health")?.id || categoryId;
    }

    const catName = categories.find((c: any) => c.id === categoryId)?.name || "Other";
    const today = new Date().toISOString().split("T")[0];
    const expense = {
      amount,
      description: desc.charAt(0).toUpperCase() + desc.slice(1),
      categoryId,
      date: today,
      userId,
    };

    const created = await storage.createExpense(expense);
    await storage.recalculateSavings(userId);
    const newTotal = monthlyData.total + amount;
    const remaining = budget - newTotal;

    let budgetNote = "";
    if (budget > 0) {
      budgetNote = remaining >= 0
        ? `\n\nBudget remaining: **${currency} ${remaining.toFixed(2)}**`
        : `\n\n⚠️ You're **${currency} ${Math.abs(remaining).toFixed(2)}** over budget this month.`;
    }

    return {
      text: `Got it — recorded **${currency} ${amount.toFixed(2)}** for "${expense.description}" under **${catName}**. Total this month: ${currency} ${newTotal.toFixed(2)}.${budgetNote}`,
      action: { type: "expense_added", expense: created },
    };
  }

  // Insights request
  if (/insight|analysis|analyze|summary|how.*spend|spending.*pattern|advice|tip|suggest|budget|saving/i.test(lower)) {
    const topCategories = [...monthlyData.byCategory].sort((a: any, b: any) => b.total - a.total).slice(0, 3);
    const topList = topCategories.map((c: any) => `- **${c.categoryName}**: ${currency} ${c.total.toFixed(2)}`).join("\n");
    const remaining = budget - monthlyData.total;

    let budgetInfo = budget > 0
      ? `**Monthly Budget**: ${currency} ${budget.toFixed(2)}\n**Spent**: ${currency} ${monthlyData.total.toFixed(2)}\n**Remaining**: ${currency} ${remaining.toFixed(2)}${remaining < 0 ? " ⚠️ Over budget" : ""}\n`
      : "No budget set for this month.\n";

    return {
      text: `Here's your spending summary:\n\n${budgetInfo}\n**Savings Balance**: ${currency} ${savings.toFixed(2)}\n\n**Top categories:**\n${topList || "No expenses recorded yet."}\n\n${monthlyData.total > 0 && budget > 0 && remaining < 0 ? "You've exceeded your budget. The overspend is being deducted from your savings." : monthlyData.total > 0 ? "You're on track this month." : "Start adding expenses to see insights."}`,
      action: null,
    };
  }

  // Default help response
  return {
    text: `I can help you with:\n\n- **Add expenses**: "Spent $20 on lunch" or "Paid ¥5000 for groceries"\n- **Get insights**: "How am I spending?" or "Budget status"\n- **Savings info**: "How are my savings?"\n\n${budget > 0 ? `Budget: **${currency} ${budget.toFixed(2)}** | Spent: **${currency} ${monthlyData.total.toFixed(2)}** | Savings: **${currency} ${savings.toFixed(2)}**` : `No budget set. Set one in the Budget & Savings page.`}\n\n⚠️ *Groq AI not connected. Using built-in intelligence. Add your Groq API key in Settings for smarter responses.*`,
    action: null,
  };
}
