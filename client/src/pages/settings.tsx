import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Settings as SettingsIcon, CheckCircle, AlertCircle, Loader2, Eye, EyeOff } from "lucide-react";
import type { Setting } from "@shared/schema";

export default function SettingsPage() {
  const { toast } = useToast();
  const [groqApiKey, setGroqApiKey] = useState("");
  const [groqModel, setGroqModel] = useState("llama-3.3-70b-versatile");
  const [currency, setCurrency] = useState("JPY");
  const [connectionStatus, setConnectionStatus] = useState<"unknown" | "checking" | "connected" | "failed">("unknown");
  const [showApiKey, setShowApiKey] = useState(false);

  const { data: settings, isLoading } = useQuery<Setting[]>({
    queryKey: ["/api/settings"],
    queryFn: async () => { const res = await apiRequest("GET", "/api/settings"); return res.json(); },
  });

  useEffect(() => {
    if (settings) {
      setGroqApiKey(settings.find(s => s.key === "groq_api_key")?.value || "");
      setGroqModel(settings.find(s => s.key === "groq_model")?.value || "llama-3.3-70b-versatile");
      setCurrency(settings.find(s => s.key === "currency")?.value || "JPY");
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const res = await apiRequest("PATCH", `/api/settings/${key}`, { value });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Settings saved" });
    },
  });

  const handleSave = () => {
    updateMutation.mutate({ key: "groq_api_key", value: groqApiKey });
    updateMutation.mutate({ key: "groq_model", value: groqModel });
    updateMutation.mutate({ key: "currency", value: currency });
  };

  const testConnection = async () => {
    setConnectionStatus("checking");
    try {
      const res = await apiRequest("POST", "/api/ai/chat", { message: "test connection" });
      const data = await res.json();
      setConnectionStatus(data.groqError ? "failed" : "connected");
    } catch {
      setConnectionStatus("failed");
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[800px]">
      <div>
        <h1 className="text-xl font-semibold tracking-tight" data-testid="text-page-title">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure AI and preferences</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Groq AI Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Groq API Key</Label>
            <div className="relative">
              <Input
                type={showApiKey ? "text" : "password"}
                value={groqApiKey}
                onChange={e => setGroqApiKey(e.target.value)}
                placeholder="gsk_..."
                data-testid="input-groq-api-key"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Get a free key at <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">console.groq.com</a>
            </p>
          </div>
          <div>
            <Label>Model</Label>
            <Input value={groqModel} onChange={e => setGroqModel(e.target.value)} data-testid="input-groq-model" />
            <p className="text-xs text-muted-foreground mt-1">e.g., llama-3.3-70b-versatile, llama-3.1-8b-instant, mixtral-8x7b-32768</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={testConnection} disabled={connectionStatus === "checking"} data-testid="button-test-connection">
              {connectionStatus === "checking" ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <SettingsIcon className="h-3.5 w-3.5 mr-1.5" />}
              Test Connection
            </Button>
            {connectionStatus === "connected" && (
              <span className="flex items-center gap-1 text-xs text-emerald-500">
                <CheckCircle className="h-3.5 w-3.5" /> Connected
              </span>
            )}
            {connectionStatus === "failed" && (
              <span className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5" /> Failed to connect
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Currency</Label>
            <Input value={currency} onChange={e => setCurrency(e.target.value)} data-testid="input-currency" />
            <p className="text-xs text-muted-foreground mt-1">ISO 4217 code: JPY, USD, EUR, INR, etc.</p>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={updateMutation.isPending} data-testid="button-save-settings">
        {updateMutation.isPending ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}
