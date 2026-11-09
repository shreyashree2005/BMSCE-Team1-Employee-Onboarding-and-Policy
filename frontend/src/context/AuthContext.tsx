import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError, UNAUTHORIZED_EVENT } from "../services/apiClient";
import * as authApi from "../services/authApi";
import type { AuthUser } from "../types/auth";
import type { EmployeeProfile } from "../types/dashboard";
import { useToast } from "./ToastContext";

/** "checking": restoring the session on page load; "unavailable": the server couldn't be reached to check. */
export type AuthStatus = "checking" | "authenticated" | "anonymous" | "unavailable";

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  /** Message explaining why the user was returned to sign-in (e.g. an expired session). */
  notice: string | null;
  /** True after an explicit sign-out: the next person to sign in starts on their own home page. */
  signedOut: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  /** Creates an Employee account and signs the new user in. */
  register: (input: authApi.RegistrationInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
  retry: () => void;
  /** Replaces the signed-in user with the server's latest copy (e.g. after a photo or preference change). */
  updateUser: (user: AuthUser) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Restores the session from the httpOnly cookie on load (via /auth/me), and handles sign-in and sign-out.
 * The token itself is never stored in JavaScript-accessible storage.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [checkCount, setCheckCount] = useState(0);
  const { showToast } = useToast();
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    const controller = new AbortController();
    setStatus("checking");
    authApi
      .fetchCurrentUser(controller.signal)
      .then((current) => {
        setUser(current);
        setStatus(current ? "authenticated" : "anonymous");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("unavailable");
      });
    return () => controller.abort();
  }, [checkCount]);

  // Any API call answered with 401 means the session ended (expired, revoked or account disabled).
  useEffect(() => {
    const onUnauthorized = () => {
      if (statusRef.current !== "authenticated") return;
      setUser(null);
      setStatus("anonymous");
      setNotice("Your session has ended. Please sign in again.");
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const register = useCallback(async (input: authApi.RegistrationInput) => {
    const session = await authApi.register(input);
    setUser(session.user);
    setStatus("authenticated");
    setNotice(null);
    setSignedOut(false);
    return session.user;
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const session = await authApi.login(email, password);
    setUser(session.user);
    setStatus("authenticated");
    setNotice(null);
    setSignedOut(false);
    return session.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (error) {
      // The cookie couldn't be cleared server-side (e.g. offline). Still leave the app; tell the user.
      showToast(error instanceof ApiError ? `Signed out locally. ${error.message}` : "Signed out locally.", "info");
    }
    setSignedOut(true);
    setUser(null);
    setStatus("anonymous");
    setNotice(null);
  }, [showToast]);

  const retry = useCallback(() => setCheckCount((count) => count + 1), []);
  const updateUser = useCallback((next: AuthUser) => setUser((current) => (current && current.id === next.id ? next : current)), []);

  const value = useMemo(
    () => ({ status, user, notice, signedOut, login, register, logout, retry, updateUser }),
    [status, user, notice, signedOut, login, register, logout, retry, updateUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

/** The signed-in user (only call inside protected routes). */
export function useCurrentUser(): AuthUser {
  const { user } = useAuth();
  if (!user) throw new Error("useCurrentUser must be used inside a protected route");
  return user;
}

export function toEmployeeProfile(user: AuthUser): EmployeeProfile {
  const [first, ...rest] = user.fullName.split(" ");
  const profile = user.profile;
  return {
    firstName: profile?.firstName ?? first,
    lastName: profile?.lastName ?? rest.join(" "),
    role: profile?.jobTitle ?? (user.role === "hr" ? "HR team" : "Employee"),
    department: profile?.department ?? (user.role === "hr" ? "People Operations" : ""),
    location: profile?.location ?? "",
    email: user.email,
    startDate: profile?.startDate ?? "",
    manager: profile?.managerName ?? "Not assigned",
    buddy: profile?.buddyName ?? "Not assigned",
  };
}

/** Display profile of the signed-in user, built from their account (not mock data). */
export function useProfile(): EmployeeProfile {
  const user = useCurrentUser();
  return useMemo(() => toEmployeeProfile(user), [user]);
}
