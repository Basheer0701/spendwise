import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { ArrowUpRight, ArrowDownRight, Minus, PiggyBank, Wallet, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

const CHART_COLORS = [
  "hsl(170, 65%, 42%)", "hsl(43, 74%, 58%)", "hsl(220, 60%, 60%)",
  "hsl(320, 47%, 65%)", "hsl(20, 73%, 55%)", "hsl(97, 43%, 47%)",
  "hsl(188, 35%, 47%)", "hsl(0, 72%, 51%)",
];

export default function Dashboard() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/dashboard"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/dashboard");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const trendData = data?.trend?.map((t: any) => ({
    month: format(new Date(t.month + "-01"), "MMM"),
    total: t.total,
  })) || [];

  const categoryData = data?.byCategory?.map((c: any, i: number) => ({
    name: c.categoryName,
    value: c.total,
    color: c.color || CHART_COLORS[i % CHART_COLORS.length],
  })) || [];

  const budget = data?.budget || 0;
  const spent = data?.total || 0;
  const remaining = budget - spent;
  const budgetUsed = budget > 0 ? (spent / budget * 100) : 0;
  const savings = data?.savings || 0;

  const prevMonth = trendData.length >= 2 ? trendData[trendData.length - 2]?.total || 0 : 0;
  const changePercent = prevMonth > 0 ? ((spent - prevMonth) / prevMonth * 100) : 0;

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-xl font-semibold tracking-tight" data-testid="text-page-title">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {format(new Date(), "MMMM yyyy")} overview
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-testid="card-total-spending">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Spending</p>
            <p className="text-xl font-bold tabular-nums mt-1">
              {new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(spent)}
            </p>
            <div className="flex items-center gap-1 mt-2 text-sm">
              {changePercent > 0 ? (
                <><ArrowUpRight className="h-3.5 w-3.5 text-destructive" /><span className="text-destructive">{changePercent.toFixed(1)}%</span></>
              ) : changePercent < 0 ? (
                <><ArrowDownRight className="h-3.5 w-3.5 text-emerald-500" /><span className="text-emerald-500">{Math.abs(changePercent).toFixed(1)}%</span></>
              ) : (
                <><Minus className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-muted-foreground">0%</span></>
              )}
              <span className="text-muted-foreground">vs last month</span>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-budget-status">
          <CardContent className="pt-6">
            <div className="flex items-center gap-1.5 mb-1">
              <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Budget</p>
            </div>
            {budget > 0 ? (
              <>
                <p className="text-xl font-bold tabular-nums">
                  {new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(budget)}
                </p>
                <div className="mt-2">
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(budgetUsed, 100)}%`,
                        backgroundColor: budgetUsed > 90 ? "hsl(0, 72%, 51%)" : budgetUsed > 70 ? "hsl(43, 74%, 58%)" : "hsl(170, 65%, 42%)",
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{budgetUsed.toFixed(0)}% used</p>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">Not set</p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-remaining">
          <CardContent className="pt-6">
            <div className="flex items-center gap-1.5 mb-1">
              {remaining < 0 && budget > 0 ? (
                <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
              ) : (
                <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <p className="text-sm text-muted-foreground">Remaining</p>
            </div>
            {budget > 0 ? (
              <>
                <p className={`text-xl font-bold tabular-nums ${remaining < 0 ? "text-destructive" : ""}`}>
                  {remaining < 0 ? "-" : ""}{new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(Math.abs(remaining))}
                </p>
                {remaining < 0 && (
                  <p className="text-xs text-destructive mt-1">Over budget — using savings</p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">Set a budget first</p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-savings">
          <CardContent className="pt-6">
            <div className="flex items-center gap-1.5 mb-1">
              <PiggyBank className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Savings</p>
            </div>
            <p className={`text-xl font-bold tabular-nums ${savings > 0 ? "text-emerald-500" : ""}`}>
              {new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(savings)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {savings > 0 ? "Accumulated from past months" : "Save by spending under budget"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card data-testid="card-spending-trend">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Spending Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(value: number) => [
                      new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(value),
                      "Total"
                    ]}
                  />
                  <Bar dataKey="total" fill="hsl(170, 65%, 42%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">
                No spending data yet
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-category-breakdown">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Category Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%" cy="50%"
                    innerRadius={55} outerRadius={85}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {categoryData.map((entry: any, i: number) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(value: number) => [
                      new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(value),
                    ]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: "11px" }}
                    formatter={(value: string) => <span className="text-foreground">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">
                No category data yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Expenses */}
      <Card data-testid="card-recent-expenses">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Recent Expenses</CardTitle>
        </CardHeader>
        <CardContent>
          {data?.recentExpenses?.length > 0 ? (
            <div className="space-y-3">
              {data.recentExpenses.map((exp: any) => {
                const cat = data.categories?.find((c: any) => c.id === exp.categoryId);
                return (
                  <div key={exp.id} className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: cat?.color || "#797876" }}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{exp.description}</p>
                        <p className="text-xs text-muted-foreground">{cat?.name || "Uncategorized"}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-medium tabular-nums">
                        {new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(exp.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground">{exp.date}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-sm text-muted-foreground">No expenses recorded yet</p>
              <p className="text-xs text-muted-foreground mt-1">Add your first expense to see it here</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
