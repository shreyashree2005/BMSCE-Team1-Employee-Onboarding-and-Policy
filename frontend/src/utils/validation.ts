/**
 * Client-side checks for the sign-up form. They mirror the API's rules (backend/app/core/password_policy.py and
 * RegisterRequest) for instant feedback; the API validates everything again and is the authority.
 */

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const NAME_PATTERN = /^\p{L}+(?:[ '.-]\p{L}+)*\.?$/u;
const WEAK_FRAGMENTS = ["password", "passw0rd", "qwerty", "123456", "letmein", "welcome", "onboardiq", "iloveyou", "abc123"];

export function normalizeName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function fullNameError(value: string): string | null {
  const name = normalizeName(value);
  if (!name) return "Enter your full name.";
  if (name.length > 200) return "Use at most 200 characters.";
  if (!NAME_PATTERN.test(name)) return "Use letters only (spaces, hyphens and apostrophes are fine).";
  if (!name.includes(" ")) return "Enter your first and last name.";
  return null;
}

/** One part of a name (first, middle or last). `label` is e.g. "first name"; optional parts may be empty. */
export function namePartError(value: string, label: string, { required = true }: { required?: boolean } = {}): string | null {
  const name = normalizeName(value);
  if (!name) return required ? `Enter your ${label}.` : null;
  if (name.length > 100) return "Use at most 100 characters.";
  if (!NAME_PATTERN.test(name)) return "Use letters only (spaces, hyphens and apostrophes are fine).";
  return null;
}

/** First + middle (if given) + last, as the server stores it. */
export function combineName(first: string, middle: string, last: string): string {
  return [first, middle, last].map(normalizeName).filter(Boolean).join(" ");
}

export function emailError(value: string): string | null {
  const email = value.trim();
  if (!email) return "Enter your work email.";
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return "Enter a valid email address, like name@company.com.";
  return null;
}

export interface PasswordRule {
  id: string;
  label: string;
  met: boolean;
}

/** Each strength rule with whether the password meets it (for the live checklist). */
export function passwordRules(password: string, email = "", fullName = ""): PasswordRule[] {
  const lowered = password.toLowerCase();
  const personal = `${fullName} ${email.split("@")[0]}`
    .toLowerCase()
    .split(/[\s@._+-]+/)
    .filter((part) => part.length >= 3);
  const usesPersonal = personal.some((part) => lowered.includes(part));
  const usesCommon = WEAK_FRAGMENTS.some((fragment) => lowered.includes(fragment));
  return [
    { id: "length", label: `${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} characters`, met: password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH },
    { id: "lower", label: "A lowercase letter", met: /[a-z]/.test(password) },
    { id: "upper", label: "An uppercase letter", met: /[A-Z]/.test(password) },
    { id: "number", label: "A number", met: /\d/.test(password) },
    { id: "personal", label: "Not your name, email or a common password", met: password.length > 0 && !usesPersonal && !usesCommon },
  ];
}

export function passwordError(password: string, email = "", fullName = ""): string | null {
  if (!password) return "Create a password.";
  const unmet = passwordRules(password, email, fullName).filter((rule) => !rule.met);
  return unmet.length ? "Choose a stronger password that meets every requirement below." : null;
}

export function confirmPasswordError(password: string, confirm: string): string | null {
  if (!confirm) return "Confirm your password.";
  return password === confirm ? null : "Passwords don't match.";
}

export const PROFILE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;

/** Client-side check before uploading a profile photo (the server re-checks the actual image content). */
export function photoError(file: File): string | null {
  if (!/\.(jpe?g|png)$/i.test(file.name) || !["image/jpeg", "image/png", ""].includes(file.type)) return "Choose a JPG or PNG image.";
  if (file.size === 0) return "The file is empty.";
  if (file.size > PROFILE_PHOTO_MAX_BYTES) return "Photos can be at most 2 MB.";
  return null;
}
