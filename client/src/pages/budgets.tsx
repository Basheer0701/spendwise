import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { PiggyBank, Wallet, TrendingUp, TrendingDown, AlertTriangle, CheckCircle } from "lucide-react";
import { format } from "date-fns";

export default function BudgetAndSavings() {
  const currentMonth = format(new Date(), "yyyy-MM");
  const [budgetInput, setBudgetInput] = useState("");
  const { toast } = useToast();

  // Current month budget + savings info
  const { data: budgetData, isLoading } = useQuery<any>({
    queryKey: ["/api/budget", currentMonth],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/budget?month=${currentMonth}`);
      return res.json();
    },
  });

  // Budget history
  const { data: history } = useQuery<any[]>({
    queryKey: ["/api/budget/history"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/budget/history");
      return res.json();
    },
  });

  const setBudgetMutation = useMutation({
    mutationFn: async (amount: number) => {
      const res = await apiRequest("POST", "/api/budget", { amount, month: currentMonth });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budget"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/savings"] });
      setBudgetInput("");
      toast({ title: "Budget updated" });
    },
  });

  const handleSetBudget = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(budgetInput);
    if (!amount || amount <= 0) return;
    setBudgetMutation.mutate(amount);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const budget = budgetData?.budget || 0;
  const spent = budgetData?.spent || 0;
  const remaining = budgetData?.remaining || 0;
  const savings = budgetData?.savings || 0;
  const budgetUsed = budget > 0 ? (spent / budget * 100) : 0;

  return (
    <div className="p-6 space-y-6 max-w-[1200px]">
      <div>
        <h1 className="text-xl font-semibold tracking-tight" data-testid="text-page-title">Budget & Savings</h1>
        <p className="text-sm text-muted-foreground mt-1">{format(new Date(), "MMMM yyyy")}</p>
      </div>

      {/* Set Budget Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Set Monthly Budget</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSetBudget} className="flex items-end gap-3">
            <div className="flex-1">
              <Label>Budget Amount</Label>
              <Input
                type="number"
                step="1"
                min="1"
                placeholder={budget > 0 ? `Current: ¥${budget.toLocaleString()}` : "Enter budget amount"}
                value={budgetInput}
                onChange={e => setBudgetInput(e.target.value)}
                data-testid="input-budget-amount"
              />
            </div>
            <Button type="submit" disabled={setBudgetMutation.isPending} data-testid="button-set-budget">
              {setBudgetMutation.isPending ? "Saving..." : budget > 0 ? "Update" : "Set Budget"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card data-testid="card-budget">
          <CardContent className="pt-6">
            <div className="flex items-center gap-1.5 mb-1">
              <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Budget vs Spent</p>
            </div>
            {budget > 0 ? (
              <>
                <p className="text-xl font-bold tabular-nums">
                  ¥{spent.toLocaleString()} / ¥{budget.toLocaleString()}
                </p>
                <div className="mt-2">
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
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
              <p className="text-sm text-muted-foreground mt-1">No budget set yet</p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-remaining">
          <CardContent className="pt-6">
            <div className="flex items-center gap-1.5 mb-1">
              {remaining < 0 && budget > 0 ? (
                <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
              ) : (
                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <p className="text-sm text-muted-foreground">Remaining</p>
            </div>
            {budget > 0 ? (
              <>
                <p className={`text-xl font-bold tabular-nums ${remaining < 0 ? "text-destructive" : "text-emerald-500"}`}>
                  {remaining < 0 ? "-" : ""}¥{Math.abs(remaining).toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {remaining >= 0
                    ? "Will be added to savings at month end"
                    : "Overspend deducted from savings"}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">Set a budget to track</p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-savings">
          <CardContent className="pt-6">
            <div className="flex items-center gap-1.5 mb-1">
              <PiggyBank className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Total Savings</p>
            </div>
            <p className={`text-xl font-bold tabular-nums ${savings > 0 ? "text-emerald-500" : ""}`}>
              ¥{savings.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {savings > 0 ? "Accumulated from unspent budgets" : "Spend under budget to save"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* How it works */}
      {!budget && (
        <Card>
          <CardContent className="py-8 text-center">
            <PiggyBank className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium mb-1">How Budget & Savings Works</p>
            <div className="text-xs text-muted-foreground space-y-1 max-w-md mx-auto">
              <p>1. Set a monthly budget above</p>
              <p>2. Unspent money at month end goes into savings</p>
              <p>3. If you overspend, the extra is deducted from savings</p>
              <p>4. Savings can never go below zero</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Budget History */}
      {history && history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Monthly History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {history.map((h: any) => {
                const isOver = h.status === "over";
                const pct = h.budget > 0 ? (h.spent / h.budget * 100) : 0;
                return (
                  <div key={h.month} className="flex items-center gap-4" data-testid={`row-history-${h.month}`}>
                    <div className="w-20 shrink-0">
                      <p className="text-sm font-medium tabular-nums">{h.month}</p>
                    </div>
                    <div className="flex-1">
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(pct, 100)}%`,
                            backgroundColor: isOver ? "hsl(0, 72%, 51%)" : "hsl(170, 65%, 42%)",
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs tabular-nums text-muted-foreground">
                        ¥{h.spent.toLocaleString()} / ¥{h.budget.toLocaleString()}
                      </span>
                      {isOver ? (
                        <TrendingDown className="h-3.5 w-3.5 text-destructive" />
                      ) : (
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
