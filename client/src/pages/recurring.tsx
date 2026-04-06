import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Repeat } from "lucide-react";
import type { RecurringExpense, Category } from "@shared/schema";

export default function RecurringPage() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ amount: "", description: "", categoryId: "", frequency: "monthly", startDate: new Date().toISOString().split("T")[0] });
  const { toast } = useToast();

  const { data: recurring, isLoading } = useQuery<RecurringExpense[]>({
    queryKey: ["/api/recurring"],
    queryFn: async () => { const res = await apiRequest("GET", "/api/recurring"); return res.json(); },
  });

  const { data: categories } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    queryFn: async () => { const res = await apiRequest("GET", "/api/categories"); return res.json(); },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/recurring", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring"] });
      setOpen(false);
      setForm({ amount: "", description: "", categoryId: "", frequency: "monthly", startDate: new Date().toISOString().split("T")[0] });
      toast({ title: "Recurring expense created" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/recurring/${id}`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/recurring/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring"] });
      toast({ title: "Recurring expense removed" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      amount: parseFloat(form.amount),
      description: form.description,
      categoryId: form.categoryId ? parseInt(form.categoryId) : null,
      frequency: form.frequency,
      startDate: form.startDate,
      isActive: true,
    });
  };

  const freqLabel: Record<string, string> = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };

  const totalMonthly = recurring?.filter(r => r.isActive).reduce((sum, r) => {
    if (r.frequency === "daily") return sum + r.amount * 30;
    if (r.frequency === "weekly") return sum + r.amount * 4;
    if (r.frequency === "yearly") return sum + r.amount / 12;
    return sum + r.amount;
  }, 0) || 0;

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-32" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1200px]">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" data-testid="text-page-title">Recurring Expenses</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Est. {new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(totalMonthly)}/month
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-recurring"><Plus className="h-4 w-4 mr-2" />Add Recurring</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Recurring Expense</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Description</Label>
                <Input required value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} data-testid="input-recurring-desc" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Amount</Label>
                  <Input type="number" step="1" required value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} data-testid="input-recurring-amount" />
                </div>
                <div>
                  <Label>Frequency</Label>
                  <Select value={form.frequency} onValueChange={v => setForm(f => ({ ...f, frequency: v }))}>
                    <SelectTrigger data-testid="select-frequency"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Category</Label>
                  <Select value={form.categoryId} onValueChange={v => setForm(f => ({ ...f, categoryId: v }))}>
                    <SelectTrigger data-testid="select-recurring-category"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {categories?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Start Date</Label>
                  <Input type="date" required value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} data-testid="input-recurring-start" />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-recurring">
                {createMutation.isPending ? "Saving..." : "Add Recurring"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {recurring && recurring.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {recurring.map(r => {
                const cat = categories?.find(c => c.id === r.categoryId);
                return (
                  <div key={r.id} className="flex items-center justify-between gap-4 px-4 py-3" data-testid={`row-recurring-${r.id}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: cat?.color || "#797876" }} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{r.description}</p>
                          <Badge variant="secondary" className="text-[10px]">{freqLabel[r.frequency] || r.frequency}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{cat?.name || "Uncategorized"} &middot; Since {r.startDate}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <p className="text-sm font-semibold tabular-nums">
                        {new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(r.amount)}
                      </p>
                      <Switch
                        checked={r.isActive ?? false}
                        onCheckedChange={(checked) => toggleMutation.mutate({ id: r.id, isActive: checked })}
                        data-testid={`switch-active-${r.id}`}
                      />
                      <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(r.id)} data-testid={`button-delete-recurring-${r.id}`}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Repeat className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">No recurring expenses</p>
            <p className="text-xs text-muted-foreground mt-1">Track subscriptions and recurring bills</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
