import type { AuthSession, AuthUser } from "../types/auth";
import { ApiError, apiRequest } from "./apiClient";

const BASE_PATH = "/api/v1/auth";

function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== "object") return false;
  const user = value as Record<string, unknown>;
  return (
    typeof user.id === "number" &&
    typeof user.email === "string" &&
    typeof user.fullName === "string" &&
    (user.role === "employee" || user.role === "hr") &&
    (user.profile === null || user.profile === undefined || typeof user.profile === "object")
  );
}

function assertUser(value: unknown): AuthUser {
  if (!isAuthUser(value)) throw new ApiError("The server returned an unexpected account format.", null);
  return { ...value, profile: value.profile ?? null };
}

/** Signs in. The session token is set by the server as an httpOnly cookie; it is never visible to scripts. */
export async function login(email: string, password: string): Promise<AuthSession> {
  const data = await apiRequest<{ user?: unknown; expiresAt?: unknown }>(
    `${BASE_PATH}/login`,
    { method: "POST", body: JSON.stringify({ email, password }) },
    { skipUnauthorizedEvent: true },
  );
  if (typeof data?.expiresAt !== "string") throw new ApiError("The server returned an unexpected session format.", null);
  return { user: assertUser(data.user), expiresAt: data.expiresAt };
}

export interface RegistrationInput {
  firstName: string;
  /** Optional; null when blank. The server stores the full name as "First Middle Last". */
  middleName: string | null;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  /** Job function; decides the onboarding checklist (never an access right). */
  jobRole: string;
}

/** Asks for a password reset email. The response is the same whether or not the account exists. */
export async function requestPasswordReset(email: string): Promise<string> {
  const data = await apiRequest<{ message?: unknown }>(`${BASE_PATH}/forgot-password`, { method: "POST", body: JSON.stringify({ email }) }, { skipUnauthorizedEvent: true, timeoutMs: 20_000 });
  return typeof data?.message === "string" ? data.message : "If an account exists for that email, we've sent a reset link.";
}

/** Checks a reset link before showing the new-password form. */
export async function verifyResetToken(token: string): Promise<{ valid: boolean; emailHint: string | null }> {
  const data = await apiRequest<{ valid?: unknown; emailHint?: unknown }>(`${BASE_PATH}/reset-password/verify`, { method: "POST", body: JSON.stringify({ token }) }, { skipUnauthorizedEvent: true });
  return { valid: data?.valid === true, emailHint: typeof data?.emailHint === "string" ? data.emailHint : null };
}

export async function resetPassword(token: string, password: string, confirmPassword: string): Promise<string> {
  const data = await apiRequest<{ message?: unknown }>(`${BASE_PATH}/reset-password`, { method: "POST", body: JSON.stringify({ token, password, confirmPassword }) }, { skipUnauthorizedEvent: true });
  return typeof data?.message === "string" ? data.message : "Your password has been reset.";
}

/**
 * Creates an Employee account (the role is assigned by the server and can't be requested) and signs the new
 * user in with the same httpOnly session cookie as login.
 */
export async function register(input: RegistrationInput): Promise<AuthSession> {
  const data = await apiRequest<{ user?: unknown; expiresAt?: unknown }>(
    `${BASE_PATH}/register`,
    { method: "POST", body: JSON.stringify(input) },
    { skipUnauthorizedEvent: true, timeoutMs: 20_000 },
  );
  if (typeof data?.expiresAt !== "string") throw new ApiError("The server returned an unexpected session format.", null);
  return { user: assertUser(data.user), expiresAt: data.expiresAt };
}

/** The signed-in user, or null when there is no valid session. */
export async function fetchCurrentUser(signal?: AbortSignal): Promise<AuthUser | null> {
  try {
    return assertUser(await apiRequest<unknown>(`${BASE_PATH}/me`, { signal }, { skipUnauthorizedEvent: true }));
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

/** Remembers that the website tour / company introduction was finished or dismissed (false shows it again). */
export async function updatePreferences(preferences: { tourCompleted?: boolean; companyIntroSeen?: boolean }): Promise<AuthUser> {
  return assertUser(await apiRequest<unknown>(`${BASE_PATH}/me/preferences`, { method: "PATCH", body: JSON.stringify(preferences) }));
}

/** Uploads or replaces the profile photo (JPG/PNG, validated and resized by the server). */
export async function uploadProfilePhoto(file: File): Promise<AuthUser> {
  const form = new FormData();
  form.append("file", file);
  return assertUser(await apiRequest<unknown>(`${BASE_PATH}/me/photo`, { method: "POST", body: form }, { timeoutMs: 60_000 }));
}

export async function deleteProfilePhoto(): Promise<AuthUser> {
  return assertUser(await apiRequest<unknown>(`${BASE_PATH}/me/photo`, { method: "DELETE" }));
}

export async function logout(): Promise<void> {
  await apiRequest<void>(`${BASE_PATH}/logout`, { method: "POST" }, { skipUnauthorizedEvent: true });
}
