import { createContext, useContext, useState, useEffect, useCallback } from "react";

interface User {
  id: number;
  email: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

// Token stored in localStorage for persistence across refreshes
// Falls back to memory-only if localStorage is unavailable (e.g. sandboxed iframe)
const STORAGE_KEY = "spendwise_token";

function loadToken(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}
function saveToken(t: string | null) {
  try { t ? localStorage.setItem(STORAGE_KEY, t) : localStorage.removeItem(STORAGE_KEY); } catch {}
}

let _authToken: string | null = loadToken();

export function getAuthToken(): string | null {
  return _authToken;
}

async function authFetch(url: string, options?: RequestInit) {
  const headers: Record<string, string> = { ...(options?.headers as Record<string, string> || {}) };
  if (_authToken) {
    headers["Authorization"] = `Bearer ${_authToken}`;
  }
  return fetch(`${API_BASE}${url}`, { ...options, headers });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session from localStorage on mount
  useEffect(() => {
    const saved = loadToken();
    if (saved) {
      _authToken = saved;
      // Verify token is still valid with the server
      fetch(`${API_BASE}/api/auth/me`, {
        headers: { "Authorization": `Bearer ${saved}` },
      }).then(res => {
        if (res.ok) return res.json();
        throw new Error("Token invalid");
      }).then(data => {
        setUser({ id: data.id, email: data.email, name: data.name });
        setToken(saved);
      }).catch(() => {
        _authToken = null;
        saveToken(null);
      }).finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");
    _authToken = data.token;
    saveToken(data.token);
    setToken(data.token);
    setUser({ id: data.id, email: data.email, name: data.name });
  }, []);

  const signup = useCallback(async (email: string, password: string, name: string) => {
    const res = await fetch(`${API_BASE}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Signup failed");
    _authToken = data.token;
    saveToken(data.token);
    setToken(data.token);
    setUser({ id: data.id, email: data.email, name: data.name });
  }, []);

  const logout = useCallback(async () => {
    if (_authToken) {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${_authToken}` },
      }).catch(() => {});
    }
    _authToken = null;
    saveToken(null);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, token, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
