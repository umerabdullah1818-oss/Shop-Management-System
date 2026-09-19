"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiRequest, getToken, setToken } from "./api-client";
import type { AuthenticatedUser } from "./types";

interface AuthContextValue {
  user: AuthenticatedUser | null;
  loading: boolean;
  loginWithPassword: (username: string, password: string) => Promise<AuthenticatedUser>;
  loginWithPin: (pin: string) => Promise<AuthenticatedUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Session restore on reload — matches SEC-003's session-scoped-to-device
    // model; nothing more to "remember" than the token itself.
    if (!getToken()) {
      setLoading(false);
      return;
    }
    apiRequest<{ user: AuthenticatedUser }>("/auth/me")
      .then((res) => setUser(res.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const loginWithPassword = useCallback(async (username: string, password: string) => {
    const res = await apiRequest<{ token: string; user: AuthenticatedUser }>("/auth/login", {
      method: "POST",
      body: { username, password },
    });
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const loginWithPin = useCallback(async (pin: string) => {
    const res = await apiRequest<{ token: string; user: AuthenticatedUser }>("/auth/login-pin", {
      method: "POST",
      body: { pin },
    });
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    apiRequest("/auth/logout", { method: "POST" }).catch(() => undefined);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, loginWithPassword, loginWithPin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
