import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Send, Bot, User, Trash2, Sparkles } from "lucide-react";
import type { AiMessage } from "@shared/schema";

const SUGGESTIONS = [
  "Spent ¥1200 on lunch",
  "How am I spending this month?",
  "Give me spending insights",
  "Paid ¥8000 for electricity",
];

export default function AiAgent() {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const { data: messages, isLoading } = useQuery<AiMessage[]>({
    queryKey: ["/api/ai/messages"],
    queryFn: async () => { const res = await apiRequest("GET", "/api/ai/messages"); return res.json(); },
  });

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await apiRequest("POST", "/api/ai/chat", { message });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/messages"] });
      if (data.action?.type === "expense_added") {
        queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        toast({ title: "Expense added by AI" });
      }
      if (data.ollamaError) {
        toast({ title: "Ollama offline — using built-in AI", variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send message", description: error.message, variant: "destructive" });
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () => { await apiRequest("DELETE", "/api/ai/messages"); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/messages"] });
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatMutation.isPending]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || chatMutation.isPending) return;
    chatMutation.mutate(input.trim());
    setInput("");
  };

  const handleSuggestion = (text: string) => {
    if (chatMutation.isPending) return;
    chatMutation.mutate(text);
  };

  const renderMarkdown = (text: string) => {
    // Simple markdown: bold, inline code, line breaks
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.*?)`/g, '<code class="px-1 py-0.5 bg-muted rounded text-xs">$1</code>')
      .replace(/```action\n[\s\S]*?\n```/g, '') // Hide action blocks
      .replace(/\n/g, '<br />');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight" data-testid="text-page-title">AI Agent</h1>
            <p className="text-xs text-muted-foreground">Natural language expense tracking</p>
          </div>
        </div>
        {messages && messages.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => clearMutation.mutate()} data-testid="button-clear-chat">
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />Clear
          </Button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-3/4" />)}
          </div>
        ) : messages && messages.length > 0 ? (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              data-testid={`message-${msg.role}-${msg.id}`}
            >
              {msg.role === "assistant" && (
                <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
              )}
              <div
                className={`max-w-[75%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-card border"
                }`}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
              />
              {msg.role === "user" && (
                <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <User className="h-3.5 w-3.5" />
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
              <Sparkles className="h-7 w-7 text-primary" />
            </div>
            <h2 className="text-base font-semibold mb-1">AI Expense Agent</h2>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              Add expenses with natural language, get spending insights, and smart categorization.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <Button
                  key={s} variant="secondary" size="sm"
                  onClick={() => handleSuggestion(s)}
                  data-testid={`button-suggestion-${s.slice(0, 10).replace(/\s/g, "-")}`}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}

        {chatMutation.isPending && (
          <div className="flex gap-3">
            <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="bg-card border rounded-lg px-3.5 py-2.5">
              <div className="flex gap-1">
                <div className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t p-4">
        <form onSubmit={handleSubmit} className="flex gap-2 max-w-3xl mx-auto">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Type a message... e.g. 'Spent ¥1500 on coffee'"
            disabled={chatMutation.isPending}
            data-testid="input-chat"
            className="flex-1"
          />
          <Button type="submit" disabled={!input.trim() || chatMutation.isPending} data-testid="button-send">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
