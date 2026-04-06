import { pgTable, text, integer, serial, doublePrecision, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(), // bcrypt hash
  name: text("name").notNull(),
  savingsBalance: doublePrecision("savings_balance").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Categories
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("tag"),
  color: text("color").notNull().default("#4F98A3"),
  userId: integer("user_id").references(() => users.id),
});

export const insertCategorySchema = createInsertSchema(categories).omit({ id: true });
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categories.$inferSelect;

// Expenses
export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  amount: doublePrecision("amount").notNull(),
  description: text("description").notNull(),
  categoryId: integer("category_id").references(() => categories.id),
  date: text("date").notNull(), // ISO date string YYYY-MM-DD
  notes: text("notes"),
  isRecurring: boolean("is_recurring").default(false),
  recurringId: integer("recurring_id").references(() => recurringExpenses.id),
  userId: integer("user_id").references(() => users.id),
});

export const insertExpenseSchema = createInsertSchema(expenses).omit({ id: true });
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expenses.$inferSelect;

// Monthly Budget (one total budget per month per user)
export const monthlyBudgets = pgTable("monthly_budgets", {
  id: serial("id").primaryKey(),
  amount: doublePrecision("amount").notNull(),
  month: text("month").notNull(), // YYYY-MM format
  userId: integer("user_id").references(() => users.id),
});

export const insertMonthlyBudgetSchema = createInsertSchema(monthlyBudgets).omit({ id: true });
export type InsertMonthlyBudget = z.infer<typeof insertMonthlyBudgetSchema>;
export type MonthlyBudget = typeof monthlyBudgets.$inferSelect;

// Recurring Expenses
export const recurringExpenses = pgTable("recurring_expenses", {
  id: serial("id").primaryKey(),
  amount: doublePrecision("amount").notNull(),
  description: text("description").notNull(),
  categoryId: integer("category_id").references(() => categories.id),
  frequency: text("frequency").notNull(), // daily, weekly, monthly, yearly
  startDate: text("start_date").notNull(), // ISO date string
  endDate: text("end_date"), // optional end date
  isActive: boolean("is_active").default(true),
  lastGenerated: text("last_generated"), // last date an expense was auto-generated
  userId: integer("user_id").references(() => users.id),
});

export const insertRecurringExpenseSchema = createInsertSchema(recurringExpenses).omit({ id: true });
export type InsertRecurringExpense = z.infer<typeof insertRecurringExpenseSchema>;
export type RecurringExpense = typeof recurringExpenses.$inferSelect;

// AI Chat messages
export const aiMessages = pgTable("ai_messages", {
  id: serial("id").primaryKey(),
  role: text("role").notNull(), // user or assistant
  content: text("content").notNull(),
  timestamp: text("timestamp").notNull(),
  userId: integer("user_id").references(() => users.id),
});

export const insertAiMessageSchema = createInsertSchema(aiMessages).omit({ id: true });
export type InsertAiMessage = z.infer<typeof insertAiMessageSchema>;
export type AiMessage = typeof aiMessages.$inferSelect;

// Settings (global, not per-user)
export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
});

export const insertSettingSchema = createInsertSchema(settings).omit({ id: true });
export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type Setting = typeof settings.$inferSelect;
