import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, Check, Circle, Eye, EyeOff, Loader2 } from "lucide-react";
import { AuthLayout, authInputClass } from "../components/auth/AuthLayout";
import { Button } from "../components/ui/Button";
import { ApiError } from "../services/apiClient";
import { resetPassword, verifyResetToken } from "../services/authApi";
import { confirmPasswordError, passwordError, passwordRules } from "../utils/validation";

type LinkState = { kind: "checking" } | { kind: "invalid"; message: string } | { kind: "valid"; emailHint: string | null };

const INVALID_LINK = "This reset link is invalid or has expired. Request a new one.";

/** Step 2 of a password reset: choose a new password using the emailed single-use link (?token=…). */
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const navigate = useNavigate();
  const [link, setLink] = useState<LinkState>(token ? { kind: "checking" } : { kind: "invalid", message: INVALID_LINK });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    verifyResetToken(token)
      .then((result) => !cancelled && setLink(result.valid ? { kind: "valid", emailHint: result.emailHint } : { kind: "invalid", message: INVALID_LINK }))
      .catch((caught: unknown) => !cancelled && setLink({ kind: "invalid", message: caught instanceof ApiError ? caught.message : INVALID_LINK }));
    return () => {
      cancelled = true;
    };
  }, [token]);

  // The server also checks the password doesn't contain the account's email or name.
  const rules = passwordRules(password);
  const passwordProblem = passwordError(password);
  const confirmProblem = confirmPasswordError(password, confirm);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (passwordProblem || confirmProblem || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const message = await resetPassword(token, password, confirm);
      navigate("/login", { replace: true, state: { message: `${message} Sign in with your new password.` } });
    } catch (caught) {
      setSubmitting(false);
      if (caught instanceof ApiError && caught.status === 400) {
        setLink({ kind: "invalid", message: caught.message || INVALID_LINK });
        return;
      }
      setError(caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <AuthLayout title="Choose a new password" heading="Choose a new password" subheading="Your new password replaces the old one and signs you out everywhere.">
      {link.kind === "checking" && (
        <p role="status" className="mt-6 flex items-center gap-2 text-[13px] text-slate-500">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          Checking your reset link…
        </p>
      )}

      {link.kind === "invalid" && (
        <div className="mt-6 space-y-4">
          <div role="alert" className="flex gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 text-[13px] text-rose-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            {link.message}
          </div>
          <Link to="/forgot-password" className="focus-ring block rounded-lg bg-primary-500 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-primary-600">
            Request a new link
          </Link>
        </div>
      )}

      {link.kind === "valid" && (
        <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4" aria-label="Set a new password">
          {link.emailHint && <p className="text-[13px] text-slate-600">Resetting the password for {link.emailHint}.</p>}
          {error && (
            <div role="alert" className="flex gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 text-[13px] text-rose-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              {error}
            </div>
          )}
          <div>
            <label htmlFor="reset-password" className="mb-1.5 block text-[13px] font-medium text-navy-900">
              New password
            </label>
            <div className="relative">
              <input
                id="reset-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                maxLength={128}
                required
                aria-invalid={Boolean(touched && passwordProblem)}
                aria-describedby="reset-password-requirements"
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
            {touched && passwordProblem && <p className="mt-1.5 text-[12.5px] text-rose-600">{passwordProblem}</p>}
            <ul id="reset-password-requirements" aria-label="Password requirements" className="mt-2 grid gap-1 sm:grid-cols-2">
              {rules.map((rule) => (
                <li key={rule.id} className={`flex items-start gap-1.5 text-[12px] ${rule.met ? "text-emerald-700" : "text-slate-500"}`}>
                  {rule.met ? <Check size={13} className="mt-[1px] shrink-0" aria-hidden="true" /> : <Circle size={11} className="mt-[3px] shrink-0" aria-hidden="true" />}
                  <span>
                    {rule.label}
                    <span className="sr-only">{rule.met ? " (met)" : " (not met)"}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <label htmlFor="reset-confirm" className="mb-1.5 block text-[13px] font-medium text-navy-900">
              Confirm new password
            </label>
            <input
              id="reset-confirm"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              maxLength={128}
              required
              aria-invalid={Boolean(touched && confirmProblem)}
              className={authInputClass}
            />
            {touched && confirmProblem && <p className="mt-1.5 text-[12.5px] text-rose-600">{confirmProblem}</p>}
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={submitting}>
            {submitting && <Loader2 size={17} className="animate-spin" aria-hidden="true" />}
            {submitting ? "Saving…" : "Reset password"}
          </Button>
        </form>
      )}

      <p className="mt-5 text-center text-[13px] text-slate-500">
        <Link to="/login" className="focus-ring rounded font-semibold text-primary-600 hover:text-primary-700 hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
