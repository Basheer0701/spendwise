import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  users, categories, expenses, monthlyBudgets, recurringExpenses, aiMessages, settings,
  type User, type InsertUser,
  type Category, type InsertCategory,
  type Expense, type InsertExpense,
  type MonthlyBudget, type InsertMonthlyBudget,
  type RecurringExpense, type InsertRecurringExpense,
  type AiMessage, type InsertAiMessage,
  type Setting,
} from "@shared/schema";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});
export const db = drizzle(pool);

// Default categories to seed per new user
const DEFAULT_CATEGORIES = [
  { name: "Food & Dining", icon: "utensils", color: "#E8AF34" },
  { name: "Transportation", icon: "car", color: "#5591C7" },
  { name: "Shopping", icon: "shopping-bag", color: "#A86FDF" },
  { name: "Entertainment", icon: "film", color: "#DD6974" },
  { name: "Bills & Utilities", icon: "zap", color: "#BB653B" },
  { name: "Health", icon: "heart", color: "#6DAA45" },
  { name: "Education", icon: "book-open", color: "#4F98A3" },
  { name: "Travel", icon: "plane", color: "#FDAB43" },
  { name: "Subscriptions", icon: "repeat", color: "#D163A7" },
  { name: "Other", icon: "tag", color: "#797876" },
];

// Initialize database tables
export async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      savings_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT 'tag',
      color TEXT NOT NULL DEFAULT '#4F98A3',
      user_id INTEGER REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS recurring_expenses (
      id SERIAL PRIMARY KEY,
      amount DOUBLE PRECISION NOT NULL,
      description TEXT NOT NULL,
      category_id INTEGER REFERENCES categories(id),
      frequency TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      is_active BOOLEAN DEFAULT true,
      last_generated TEXT,
      user_id INTEGER REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      amount DOUBLE PRECISION NOT NULL,
      description TEXT NOT NULL,
      category_id INTEGER REFERENCES categories(id),
      date TEXT NOT NULL,
      notes TEXT,
      is_recurring BOOLEAN DEFAULT false,
      recurring_id INTEGER REFERENCES recurring_expenses(id),
      user_id INTEGER REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS monthly_budgets (
      id SERIAL PRIMARY KEY,
      amount DOUBLE PRECISION NOT NULL,
      month TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS ai_messages (
      id SERIAL PRIMARY KEY,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS settings (
      id SERIAL PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL
    );
  `);

  // Add savings_balance column if it doesn't exist (migration for existing DBs)
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS savings_balance DOUBLE PRECISION NOT NULL DEFAULT 0`);
  } catch (e) { /* already exists */ }

  // Seed default settings if empty
  const existingSettings = await db.select().from(settings);
  if (existingSettings.length === 0) {
    await db.insert(settings).values({ key: "groq_api_key", value: process.env.GROQ_API_KEY || "" });
    await db.insert(settings).values({ key: "groq_model", value: "llama-3.3-70b-versatile" });
    await db.insert(settings).values({ key: "currency", value: "JPY" });
  }
}

export interface IStorage {
  // Auth
  createUser(email: string, password: string, name: string): Promise<User>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserById(id: number): Promise<User | undefined>;
  verifyPassword(plaintext: string, hash: string): boolean;

  // Categories (per user)
  getCategories(userId: number): Promise<Category[]>;
  createCategory(cat: InsertCategory): Promise<Category>;
  updateCategory(id: number, userId: number, cat: Partial<InsertCategory>): Promise<Category | undefined>;
  deleteCategory(id: number, userId: number): Promise<void>;

  // Expenses (per user)
  getExpenses(userId: number, filters?: { startDate?: string; endDate?: string; categoryId?: number }): Promise<Expense[]>;
  getExpense(id: number, userId: number): Promise<Expense | undefined>;
  createExpense(exp: InsertExpense): Promise<Expense>;
  updateExpense(id: number, userId: number, exp: Partial<InsertExpense>): Promise<Expense | undefined>;
  deleteExpense(id: number, userId: number): Promise<void>;

  // Monthly Budget (one per month per user)
  getMonthlyBudget(userId: number, month: string): Promise<MonthlyBudget | undefined>;
  setMonthlyBudget(userId: number, month: string, amount: number): Promise<MonthlyBudget>;
  getAllMonthlyBudgets(userId: number): Promise<MonthlyBudget[]>;

  // Savings
  getSavingsBalance(userId: number): Promise<number>;
  updateSavingsBalance(userId: number, amount: number): Promise<void>;
  recalculateSavings(userId: number): Promise<{ savingsBalance: number; monthBreakdown: { month: string; budget: number; spent: number; delta: number }[] }>;

  // Recurring (per user)
  getRecurringExpenses(userId: number): Promise<RecurringExpense[]>;
  createRecurringExpense(re: InsertRecurringExpense): Promise<RecurringExpense>;
  updateRecurringExpense(id: number, userId: number, re: Partial<InsertRecurringExpense>): Promise<RecurringExpense | undefined>;
  deleteRecurringExpense(id: number, userId: number): Promise<void>;

  // AI Messages (per user)
  getAiMessages(userId: number): Promise<AiMessage[]>;
  createAiMessage(msg: InsertAiMessage): Promise<AiMessage>;
  clearAiMessages(userId: number): Promise<void>;

  // Settings (global)
  getSettings(): Promise<Setting[]>;
  getSetting(key: string): Promise<Setting | undefined>;
  upsertSetting(key: string, value: string): Promise<Setting>;

  // Dashboard (per user)
  getMonthlyTotals(userId: number, month: string): Promise<{ total: number; byCategory: { categoryId: number; categoryName: string; total: number; color: string }[] }>;
  getSpendingTrend(userId: number, months: number): Promise<{ month: string; total: number }[]>;
}

export class PgStorage implements IStorage {
  // ===== Auth =====
  async createUser(email: string, password: string, name: string): Promise<User> {
    const hash = bcrypt.hashSync(password, 10);
    const [user] = await db.insert(users).values({
      email: email.toLowerCase().trim(),
      password: hash,
      name: name.trim(),
      savingsBalance: 0,
      createdAt: new Date().toISOString(),
    }).returning();

    // Seed default categories for new user
    for (const cat of DEFAULT_CATEGORIES) {
      await db.insert(categories).values({ ...cat, userId: user.id });
    }

    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
    return user;
  }

  async getUserById(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  verifyPassword(plaintext: string, hash: string): boolean {
    return bcrypt.compareSync(plaintext, hash);
  }

  // ===== Categories =====
  async getCategories(userId: number): Promise<Category[]> {
    return db.select().from(categories).where(eq(categories.userId, userId));
  }

  async createCategory(cat: InsertCategory): Promise<Category> {
    const [result] = await db.insert(categories).values(cat).returning();
    return result;
  }

  async updateCategory(id: number, userId: number, cat: Partial<InsertCategory>): Promise<Category | undefined> {
    const [result] = await db.update(categories).set(cat)
      .where(and(eq(categories.id, id), eq(categories.userId, userId)))
      .returning();
    return result;
  }

  async deleteCategory(id: number, userId: number): Promise<void> {
    await db.delete(categories).where(and(eq(categories.id, id), eq(categories.userId, userId)));
  }

  // ===== Expenses =====
  async getExpenses(userId: number, filters?: { startDate?: string; endDate?: string; categoryId?: number }): Promise<Expense[]> {
    const conditions = [eq(expenses.userId, userId)];
    if (filters?.startDate) conditions.push(gte(expenses.date, filters.startDate));
    if (filters?.endDate) conditions.push(lte(expenses.date, filters.endDate));
    if (filters?.categoryId) conditions.push(eq(expenses.categoryId, filters.categoryId));
    return db.select().from(expenses)
      .where(and(...conditions))
      .orderBy(desc(expenses.date));
  }

  async getExpense(id: number, userId: number): Promise<Expense | undefined> {
    const [result] = await db.select().from(expenses)
      .where(and(eq(expenses.id, id), eq(expenses.userId, userId)));
    return result;
  }

  async createExpense(exp: InsertExpense): Promise<Expense> {
    const [result] = await db.insert(expenses).values(exp).returning();
    return result;
  }

  async updateExpense(id: number, userId: number, exp: Partial<InsertExpense>): Promise<Expense | undefined> {
    const [result] = await db.update(expenses).set(exp)
      .where(and(eq(expenses.id, id), eq(expenses.userId, userId)))
      .returning();
    return result;
  }

  async deleteExpense(id: number, userId: number): Promise<void> {
    await db.delete(expenses).where(and(eq(expenses.id, id), eq(expenses.userId, userId)));
  }

  // ===== Monthly Budget =====
  async getMonthlyBudget(userId: number, month: string): Promise<MonthlyBudget | undefined> {
    const [result] = await db.select().from(monthlyBudgets)
      .where(and(eq(monthlyBudgets.userId, userId), eq(monthlyBudgets.month, month)));
    return result;
  }

  async setMonthlyBudget(userId: number, month: string, amount: number): Promise<MonthlyBudget> {
    const existing = await this.getMonthlyBudget(userId, month);
    if (existing) {
      const [result] = await db.update(monthlyBudgets).set({ amount })
        .where(eq(monthlyBudgets.id, existing.id))
        .returning();
      // Recalculate savings after budget change
      await this.recalculateSavings(userId);
      return result;
    }
    const [result] = await db.insert(monthlyBudgets).values({ amount, month, userId }).returning();
    // Recalculate savings after new budget
    await this.recalculateSavings(userId);
    return result;
  }

  async getAllMonthlyBudgets(userId: number): Promise<MonthlyBudget[]> {
    return db.select().from(monthlyBudgets)
      .where(eq(monthlyBudgets.userId, userId))
      .orderBy(desc(monthlyBudgets.month));
  }

  // ===== Savings =====
  async getSavingsBalance(userId: number): Promise<number> {
    const user = await this.getUserById(userId);
    return user?.savingsBalance ?? 0;
  }

  async updateSavingsBalance(userId: number, amount: number): Promise<void> {
    await db.update(users).set({ savingsBalance: amount }).where(eq(users.id, userId));
  }

  async recalculateSavings(userId: number): Promise<{ savingsBalance: number; monthBreakdown: { month: string; budget: number; spent: number; delta: number }[] }> {
    const allBudgets = await this.getAllMonthlyBudgets(userId);
    const breakdown: { month: string; budget: number; spent: number; delta: number }[] = [];

    let savings = 0;
    // Process chronologically (oldest first)
    const sortedBudgets = [...allBudgets].sort((a, b) => a.month.localeCompare(b.month));

    for (const budget of sortedBudgets) {
      const totals = await this.getMonthlyTotals(userId, budget.month);
      const delta = budget.amount - totals.total; // positive = under budget, negative = over budget
      savings += delta;
      if (savings < 0) savings = 0; // Can't go below zero
      breakdown.push({ month: budget.month, budget: budget.amount, spent: totals.total, delta });
    }

    await this.updateSavingsBalance(userId, savings);
    return { savingsBalance: savings, monthBreakdown: breakdown };
  }

  // ===== Recurring =====
  async getRecurringExpenses(userId: number): Promise<RecurringExpense[]> {
    return db.select().from(recurringExpenses).where(eq(recurringExpenses.userId, userId));
  }

  async createRecurringExpense(re: InsertRecurringExpense): Promise<RecurringExpense> {
    const [result] = await db.insert(recurringExpenses).values(re).returning();
    return result;
  }

  async updateRecurringExpense(id: number, userId: number, re: Partial<InsertRecurringExpense>): Promise<RecurringExpense | undefined> {
    const [result] = await db.update(recurringExpenses).set(re)
      .where(and(eq(recurringExpenses.id, id), eq(recurringExpenses.userId, userId)))
      .returning();
    return result;
  }

  async deleteRecurringExpense(id: number, userId: number): Promise<void> {
    await db.delete(recurringExpenses).where(and(eq(recurringExpenses.id, id), eq(recurringExpenses.userId, userId)));
  }

  // ===== AI Messages =====
  async getAiMessages(userId: number): Promise<AiMessage[]> {
    return db.select().from(aiMessages).where(eq(aiMessages.userId, userId));
  }

  async createAiMessage(msg: InsertAiMessage): Promise<AiMessage> {
    const [result] = await db.insert(aiMessages).values(msg).returning();
    return result;
  }

  async clearAiMessages(userId: number): Promise<void> {
    await db.delete(aiMessages).where(eq(aiMessages.userId, userId));
  }

  // ===== Settings =====
  async getSettings(): Promise<Setting[]> {
    return db.select().from(settings);
  }

  async getSetting(key: string): Promise<Setting | undefined> {
    const [result] = await db.select().from(settings).where(eq(settings.key, key));
    return result;
  }

  async upsertSetting(key: string, value: string): Promise<Setting> {
    const existing = await this.getSetting(key);
    if (existing) {
      const [result] = await db.update(settings).set({ value }).where(eq(settings.key, key)).returning();
      return result;
    }
    const [result] = await db.insert(settings).values({ key, value }).returning();
    return result;
  }

  // ===== Dashboard =====
  async getMonthlyTotals(userId: number, month: string): Promise<{ total: number; byCategory: { categoryId: number; categoryName: string; total: number; color: string }[] }> {
    const startDate = `${month}-01`;
    const endMonth = parseInt(month.split("-")[1]);
    const endYear = parseInt(month.split("-")[0]);
    const nextMonth = endMonth === 12 ? `${endYear + 1}-01` : `${endYear}-${String(endMonth + 1).padStart(2, "0")}`;
    const endDate = `${nextMonth}-01`;

    const monthExpenses = await db.select().from(expenses)
      .where(and(eq(expenses.userId, userId), gte(expenses.date, startDate), lte(expenses.date, endDate)));

    const total = monthExpenses.reduce((sum, e) => sum + e.amount, 0);

    const cats = await this.getCategories(userId);
    const byCategory = cats.map(cat => {
      const catTotal = monthExpenses.filter(e => e.categoryId === cat.id).reduce((sum, e) => sum + e.amount, 0);
      return { categoryId: cat.id, categoryName: cat.name, total: catTotal, color: cat.color };
    }).filter(c => c.total > 0);

    return { total, byCategory };
  }

  async getSpendingTrend(userId: number, months: number): Promise<{ month: string; total: number }[]> {
    const result: { month: string; total: number }[] = [];
    const now = new Date();
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const data = await this.getMonthlyTotals(userId, month);
      result.push({ month, total: data.total });
    }
    return result;
  }
}

export const storage = new PgStorage();
