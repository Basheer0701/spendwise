import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Pencil, Search, Receipt } from "lucide-react";
import type { Expense, Category } from "@shared/schema";

export default function Expenses() {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [form, setForm] = useState({ amount: "", description: "", categoryId: "", date: new Date().toISOString().split("T")[0], notes: "" });
  const { toast } = useToast();

  const { data: expenses, isLoading } = useQuery<Expense[]>({
    queryKey: ["/api/expenses"],
    queryFn: async () => { const res = await apiRequest("GET", "/api/expenses"); return res.json(); },
  });

  const { data: categories } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    queryFn: async () => { const res = await apiRequest("GET", "/api/categories"); return res.json(); },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/expenses", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      setOpen(false);
      resetForm();
      toast({ title: "Expense added" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/expenses/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      setOpen(false);
      setEditId(null);
      resetForm();
      toast({ title: "Expense updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/expenses/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({ title: "Expense deleted" });
    },
  });

  const resetForm = () => setForm({ amount: "", description: "", categoryId: "", date: new Date().toISOString().split("T")[0], notes: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      amount: parseFloat(form.amount),
      description: form.description,
      categoryId: form.categoryId ? parseInt(form.categoryId) : null,
      date: form.date,
      notes: form.notes || null,
    };
    if (editId) {
      updateMutation.mutate({ id: editId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleEdit = (exp: Expense) => {
    setEditId(exp.id);
    setForm({
      amount: String(exp.amount),
      description: exp.description,
      categoryId: exp.categoryId ? String(exp.categoryId) : "",
      date: exp.date,
      notes: exp.notes || "",
    });
    setOpen(true);
  };

  const filtered = expenses?.filter(e => {
    const matchSearch = !search || e.description.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === "all" || (e.categoryId && String(e.categoryId) === filterCat);
    return matchSearch && matchCat;
  }) || [];

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-32" />
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16" />)}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1200px]">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" data-testid="text-page-title">Expenses</h1>
          <p className="text-sm text-muted-foreground mt-1">{expenses?.length || 0} total</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditId(null); resetForm(); } }}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-expense"><Plus className="h-4 w-4 mr-2" />Add Expense</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editId ? "Edit Expense" : "Add Expense"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Amount</Label>
                  <Input
                    type="number" step="0.01" required
                    value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    data-testid="input-amount"
                  />
                </div>
                <div>
                  <Label>Date</Label>
                  <Input
                    type="date" required
                    value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    data-testid="input-date"
                  />
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <Input
                  required value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  data-testid="input-description"
                />
              </div>
              <div>
                <Label>Category</Label>
                <Select value={form.categoryId} onValueChange={v => setForm(f => ({ ...f, categoryId: v }))}>
                  <SelectTrigger data-testid="select-category"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories?.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="resize-none" rows={2}
                  data-testid="input-notes"
                />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit-expense">
                {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : editId ? "Update" : "Add Expense"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search expenses..."
            className="pl-9"
            value={search} onChange={e => setSearch(e.target.value)}
            data-testid="input-search"
          />
        </div>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-[180px]" data-testid="select-filter-category">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories?.map(c => (
              <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Expenses List */}
      <Card>
        <CardContent className="p-0">
          {filtered.length > 0 ? (
            <div className="divide-y divide-border">
              {filtered.map(exp => {
                const cat = categories?.find(c => c.id === exp.categoryId);
                return (
                  <div key={exp.id} className="flex items-center justify-between gap-4 px-4 py-3" data-testid={`row-expense-${exp.id}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: cat?.color || "#797876" }} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{exp.description}</p>
                        <p className="text-xs text-muted-foreground">{cat?.name || "Uncategorized"} &middot; {exp.date}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <p className="text-sm font-semibold tabular-nums">
                        {new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(exp.amount)}
                      </p>
                      <Button size="icon" variant="ghost" onClick={() => handleEdit(exp)} data-testid={`button-edit-${exp.id}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(exp.id)} data-testid={`button-delete-${exp.id}`}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Receipt className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No expenses found</p>
              <p className="text-xs text-muted-foreground mt-1">Add your first expense to get started</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
