import { useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, ClipboardCheck, Eye, EyeOff, Info, Loader2, Users } from "lucide-react";
import { AuthLayout, authInputClass } from "../components/auth/AuthLayout";
import { Button } from "../components/ui/Button";
import { canAccessPath, homePathForRole } from "../config/navigation";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../services/apiClient";

/** Fictional demo accounts seeded by the backend for local development (see README). Emails only; never passwords. */
const DEMO_ACCOUNTS = [
  { label: "Employee", name: "Shreya Nambiar", email: "shreya.nambiar@onboardiq-demo.example", icon: ClipboardCheck },
  { label: "HR", name: "Kavya Rao", email: "kavya.rao@onboardiq-demo.example", icon: Users },
] as const;

const SHOW_DEMO_ACCOUNTS = import.meta.env.VITE_SHOW_DEMO_ACCOUNTS ? import.meta.env.VITE_SHOW_DEMO_ACCOUNTS === "true" : import.meta.env.DEV;

interface LoginLocationState {
  from?: string;
  /** Pre-filled email, e.g. when the create-account page sends an existing user here. */
  email?: string;
  /** Shown above the form, e.g. after a password reset. */
  message?: string;
}

export function LoginPage() {
  const { status, user, notice, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as LoginLocationState | null) ?? {};
  const from = state.from;
  const [email, setEmail] = useState(state.email ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  if (status === "authenticated" && user && !submitting) return <Navigate to={homePathForRole(user.role)} replace />;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if (!email.trim() || !password) {
      setError("Enter your email address and password.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const signedIn = await login(email.trim(), password);
      const pathOnly = from?.split("?")[0] ?? "";
      const target = from && from !== "/login" && canAccessPath(signedIn.role, pathOnly) ? from : homePathForRole(signedIn.role);
      navigate(target, { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.");
      setPassword("");
      passwordRef.current?.focus();
      setSubmitting(false);
    }
  };

  const fillDemoAccount = (demoEmail: string) => {
    setEmail(demoEmail);
    setError(null);
    passwordRef.current?.focus();
  };

  return (
    <AuthLayout title="Sign in" heading="Sign in" subheading="Use your work email to continue to OnboardIQ.">
      {state.message && !notice && !error && (
        <div role="status" className="mt-6 flex gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-[13px] text-emerald-900">
          <Info size={16} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
          {state.message}
        </div>
      )}
      {notice && !error && (
        <div role="status" className="mt-6 flex gap-2.5 rounded-lg border border-primary-100 bg-primary-50 px-3.5 py-3 text-[13px] text-navy-900">
          <Info size={16} className="mt-0.5 shrink-0 text-primary-500" aria-hidden="true" />
          {notice}
        </div>
      )}
      {error && (
        <div role="alert" className="mt-6 flex gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 text-[13px] text-rose-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
        <div>
          <label htmlFor="login-email" className="mb-1.5 block text-[13px] font-medium text-navy-900">
            Work email
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={254}
            required
            aria-invalid={Boolean(error)}
            className={authInputClass}
            placeholder="name@company.com"
          />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label htmlFor="login-password" className="block text-[13px] font-medium text-navy-900">
              Password
            </label>
            <Link to="/forgot-password" state={{ email: email.trim() }} className="focus-ring rounded text-[12.5px] font-semibold text-primary-600 hover:text-primary-700 hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="login-password"
              ref={passwordRef}
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={128}
              required
              aria-invalid={Boolean(error)}
              className={`${authInputClass} pr-11`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="focus-ring absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:text-navy-900"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
            </button>
          </div>
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : null}
          {submitting ? "Signing in…" : "Sign in"}
          {!submitting && <ArrowRight size={17} aria-hidden="true" />}
        </Button>
      </form>

      <div className="mt-6 flex items-center gap-3 text-[11px] font-medium uppercase tracking-wide text-slate-400" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        New to OnboardIQ?
        <span className="h-px flex-1 bg-line" />
      </div>
      <p className="mt-4 rounded-lg border border-primary-100 bg-primary-50/60 px-4 py-3 text-center text-[13.5px] text-slate-600">
        Don't have an account?{" "}
        <Link to="/register" className="focus-ring rounded font-semibold text-primary-600 underline-offset-2 hover:text-primary-700 hover:underline">
          Sign Up
        </Link>
      </p>

      {SHOW_DEMO_ACCOUNTS && (
        <section aria-labelledby="demo-accounts-heading" className="mt-8 rounded-panel border border-dashed border-line-strong p-4">
          <h2 id="demo-accounts-heading" className="eyebrow text-slate-500">
            Demo accounts
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">Fictional accounts for local development. The demo password is in the project README.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {DEMO_ACCOUNTS.map(({ label, name, email: demoEmail, icon: Icon }) => (
              <button
                key={demoEmail}
                type="button"
                onClick={() => fillDemoAccount(demoEmail)}
                className="focus-ring flex items-center gap-2.5 rounded-lg border border-line bg-white px-3 py-2.5 text-left transition-colors hover:border-primary-200 hover:bg-primary-50/40"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary-500">
                  <Icon size={16} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-navy-900">{label}</span>
                  <span className="block truncate text-[11.5px] text-slate-500">{name}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </AuthLayout>
  );
}
