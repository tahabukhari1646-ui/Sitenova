"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { clearToken, getToken, setToken } from "@/lib/api-client";
import type { User } from "@/types";
import { loginUser, registerUser } from "./api";
import { decodeToken, isTokenExpired } from "./jwt";
import type { LoginInput, RegisterInput } from "./types";

type Listener = () => void;
const listeners = new Set<Listener>();

function notifyTokenChanged() {
  listeners.forEach((listener) => listener());
}

function subscribeToToken(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getTokenSnapshot(): string | null {
  return getToken();
}

function getServerTokenSnapshot(): string | null {
  return null;
}

function subscribeNever() {
  return () => {};
}

function getMountedClientSnapshot(): boolean {
  return true;
}

function getMountedServerSnapshot(): boolean {
  return false;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  // The cookie is an external, browser-owned store outside React's state —
  // useSyncExternalStore reads it safely across server/client without the
  // hydration-mismatch or cascading-render issues a useEffect+setState
  // "hydrate on mount" pattern would cause here.
  const token = useSyncExternalStore(
    subscribeToToken,
    getTokenSnapshot,
    getServerTokenSnapshot
  );
  const [sessionUser, setSessionUser] = useState<User | null>(null);

  // On a hard reload / direct navigation, the first client render must use
  // getServerSnapshot (always null) to match the static/SSR HTML, even when a
  // valid cookie exists — React only corrects to the real client snapshot in
  // a later passive-effect pass. Gating isLoading on this same
  // useSyncExternalStore pattern (server snapshot false, client snapshot
  // true) ensures AuthGuard waits for that correction instead of redirecting
  // on the momentarily-wrong isAuthenticated=false.
  const hasMounted = useSyncExternalStore(
    subscribeNever,
    getMountedClientSnapshot,
    getMountedServerSnapshot
  );

  const tokenPayload = useMemo(
    () => (token ? decodeToken(token) : null),
    [token]
  );
  const isTokenValid = tokenPayload !== null && !isTokenExpired(tokenPayload);

  const user = useMemo<User | null>(() => {
    if (!isTokenValid || !tokenPayload) return null;
    return (
      sessionUser ?? {
        id: tokenPayload.userId,
        email: tokenPayload.email,
        name: "",
        createdAt: "",
        updatedAt: "",
      }
    );
  }, [isTokenValid, tokenPayload, sessionUser]);

  const login = useCallback(async (input: LoginInput) => {
    const result = await loginUser(input);
    const payload = decodeToken(result.token);
    const maxAge = payload
      ? Math.max(payload.exp - Math.floor(Date.now() / 1000), 0)
      : 3600;
    setToken(result.token, maxAge);
    notifyTokenChanged();
    setSessionUser(result.user);
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    await registerUser(input);
  }, []);

  const logout = useCallback(() => {
    // Cancel first: an in-flight or interval-scheduled query that resolves
    // after the token is cleared would hit the backend with no Authorization
    // header, get a 401, and trigger apiFetch's hard window.location redirect —
    // racing with AuthGuard's own client-side redirect below.
    queryClient.cancelQueries();
    queryClient.clear();
    clearToken();
    notifyTokenChanged();
    setSessionUser(null);
  }, [queryClient]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading: !hasMounted,
        isAuthenticated: user !== null,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
