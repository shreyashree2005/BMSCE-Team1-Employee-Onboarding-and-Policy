import { useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { AlertCircle, ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { AuthLayout, authInputClass } from "../components/auth/AuthLayout";
import { Button } from "../components/ui/Button";
import { ApiError } from "../services/apiClient";
import { requestPasswordReset } from "../services/authApi";
import { emailError } from "../utils/validation";

/** Step 1 of a password reset: request a single-use reset link by email. */
export function ForgotPasswordPage() {
  const location = useLocation();
  const initialEmail = (location.state as { email?: string } | null)?.email ?? "";
  const [email, setEmail] = useState(initialEmail);
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);

  const validation = emailError(email);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (validation || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      setSentMessage(await requestPasswordReset(email.trim()));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout title="Forgot password" heading="Reset your password" subheading="Enter the email address you registered with and we'll send you a reset link.">
      {sentMessage ? (
        <div className="mt-6 space-y-4">
          <div role="status" className="flex gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-[13px] text-emerald-900">
            <MailCheck size={16} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
            <span>
              {sentMessage} The link expires in 30 minutes and can be used once. Check your spam folder if it doesn't arrive.
            </span>
          </div>
          <Button variant="secondary" className="w-full" onClick={() => setSentMessage(null)}>
            Use a different email
          </Button>
        </div>
      ) : (
        <>
          {error && (
            <div role="alert" className="mt-6 flex gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 text-[13px] text-rose-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              {error}
            </div>
          )}
          <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4" aria-label="Request a password reset">
            <div>
              <label htmlFor="forgot-email" className="mb-1.5 block text-[13px] font-medium text-navy-900">
                Registered email
              </label>
              <input
                id="forgot-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                onBlur={() => setTouched(true)}
                maxLength={254}
                required
                aria-invalid={Boolean(touched && validation)}
                aria-describedby={touched && validation ? "forgot-email-error" : undefined}
                className={authInputClass}
                placeholder="name@company.com"
              />
              {touched && validation && (
                <p id="forgot-email-error" className="mt-1.5 flex items-start gap-1.5 text-[12.5px] text-rose-600">
                  <AlertCircle size={14} className="mt-[1px] shrink-0" aria-hidden="true" />
                  {validation}
                </p>
              )}
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={submitting}>
              {submitting && <Loader2 size={17} className="animate-spin" aria-hidden="true" />}
              {submitting ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        </>
      )}

      <p className="mt-5 text-center text-[13px] text-slate-500">
        <Link to="/login" className="focus-ring inline-flex items-center gap-1 rounded font-semibold text-primary-600 hover:text-primary-700 hover:underline">
          <ArrowLeft size={14} aria-hidden="true" />
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
