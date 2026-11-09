import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, Check, Circle, Eye, EyeOff, Loader2 } from "lucide-react";
import { AuthLayout, authInputClass } from "../components/auth/AuthLayout";
import { Button } from "../components/ui/Button";
import { COMPANY } from "../config/company";
import { JOB_ROLES } from "../config/jobRoles";
import { homePathForRole } from "../config/navigation";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { ApiError, fieldLabel } from "../services/apiClient";
import { combineName, confirmPasswordError, emailError, namePartError, normalizeName, passwordError, passwordRules } from "../utils/validation";

type Field = "firstName" | "middleName" | "lastName" | "email" | "password" | "confirmPassword";
type ServerField = Field | "jobRole";
const SERVER_FIELDS: readonly ServerField[] = ["firstName", "middleName", "lastName", "email", "jobRole", "password", "confirmPassword"];

/** Backend checks that span several fields come without a field name; place them by what they're about. */
function fieldForMessage(message: string): ServerField | null {
  if (/first name/i.test(message)) return "firstName";
  if (/middle name/i.test(message)) return "middleName";
  if (/last name/i.test(message)) return "lastName";
  if (/passwords don.t match/i.test(message)) return "confirmPassword";
  if (/password/i.test(message)) return "password";
  if (/email/i.test(message)) return "email";
  if (/job role/i.test(message)) return "jobRole";
  return null;
}

/**
 * Turns a 422 from the registration API into errors under the matching fields. Anything that isn't one of this
 * form's fields (e.g. an older server asking for "fullName") is returned separately, so it's explained instead of
 * appearing as an unexplained "Field required".
 */
function serverFieldErrors(error: ApiError): { fields: Partial<Record<ServerField, string>>; other: string[] } {
  const fields: Partial<Record<ServerField, string>> = {};
  const other: string[] = [];
  for (const [field, message] of Object.entries(error.fields)) {
    if ((SERVER_FIELDS as readonly string[]).includes(field)) fields[field as ServerField] ??= message;
    else other.push(`${fieldLabel(field)}: ${message.replace(/\.$/, "")}`);
  }
  if (Object.keys(error.fields).length === 0) {
    const field = fieldForMessage(error.message);
    if (field) fields[field] = error.message;
    else other.push(error.message);
  }
  return { fields, other };
}

interface FieldProps {
  id: string;
  label: string;
  error: string | null;
  hint?: ReactNode;
  children: ReactNode;
}

function FormField({ id, label, error, hint, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-navy-900">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 flex items-start gap-1.5 text-[12.5px] text-rose-600">
          <AlertCircle size={14} className="mt-[1px] shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
      {hint}
    </div>
  );
}

/** Public sign-up for new employees. The server always creates an Employee account (never HR). */
export function RegisterPage() {
  const { status, user, register } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [values, setValues] = useState<Record<Field, string>>({ firstName: "", middleName: "", lastName: "", email: "", password: "", confirmPassword: "" });
  const [touched, setTouched] = useState<Record<Field, boolean>>({ firstName: false, middleName: false, lastName: false, email: false, password: false, confirmPassword: false });
  const [jobRole, setJobRole] = useState("");
  const [jobRoleTouched, setJobRoleTouched] = useState(false);
  const jobRoleRef = useRef<HTMLSelectElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Errors the server reported for a field; each one clears as soon as that field is edited.
  const [serverErrors, setServerErrors] = useState<Partial<Record<ServerField, string>>>({});
  const [emailTaken, setEmailTaken] = useState<string | null>(null);
  const refs = {
    firstName: useRef<HTMLInputElement>(null),
    middleName: useRef<HTMLInputElement>(null),
    lastName: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
    confirmPassword: useRef<HTMLInputElement>(null),
  };

  if (status === "authenticated" && user && !submitting) return <Navigate to={homePathForRole(user.role)} replace />;

  // The full name as it will be stored: First + Middle (if given) + Last.
  const fullName = combineName(values.firstName, values.middleName, values.lastName);
  const errors: Record<Field, string | null> = {
    firstName: namePartError(values.firstName, "first name"),
    middleName: namePartError(values.middleName, "middle name", { required: false }),
    lastName: namePartError(values.lastName, "last name"),
    email: emailTaken && emailTaken === values.email.trim().toLowerCase() ? "An account with this email already exists." : emailError(values.email),
    password: passwordError(values.password, values.email, fullName),
    confirmPassword: confirmPasswordError(values.password, values.confirmPassword),
  };
  const jobRoleError = jobRole ? null : "Choose your job role.";
  const shown = (field: Field) => (touched[field] ? errors[field] : null) ?? serverErrors[field] ?? null;
  const jobRoleShown = (jobRoleTouched ? jobRoleError : null) ?? serverErrors.jobRole ?? null;
  const clearServerError = (field: ServerField) => setServerErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  const rules = passwordRules(values.password, values.email, fullName);

  const update = (field: Field) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setValues((prev) => ({ ...prev, [field]: event.target.value }));
    setFormError(null);
    clearServerError(field);
    // The password rules depend on the name and email, so a server password error is stale once they change.
    if (field !== "password" && field !== "confirmPassword") clearServerError("password");
  };
  const blur = (field: Field) => () => setTouched((prev) => ({ ...prev, [field]: true }));
  const inputProps = (field: Field, required = true) => ({
    id: `register-${field}`,
    ref: refs[field],
    value: values[field],
    onChange: update(field),
    onBlur: blur(field),
    "aria-invalid": Boolean(shown(field)),
    "aria-describedby": shown(field) ? `register-${field}-error` : undefined,
    required,
  });

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setTouched({ firstName: true, middleName: true, lastName: true, email: true, password: true, confirmPassword: true });
    setJobRoleTouched(true);
    const fieldOrder: Field[] = ["firstName", "middleName", "lastName", "email"];
    const firstInvalid = fieldOrder.find((field) => errors[field]);
    if (firstInvalid) {
      refs[firstInvalid].current?.focus();
      return;
    }
    if (jobRoleError) {
      jobRoleRef.current?.focus();
      return;
    }
    const firstPasswordInvalid = (["password", "confirmPassword"] as Field[]).find((field) => errors[field]);
    if (firstPasswordInvalid) {
      refs[firstPasswordInvalid].current?.focus();
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setServerErrors({});
    try {
      const created = await register({
        firstName: normalizeName(values.firstName),
        // Optional: sent as null when blank (never an empty or missing required value).
        middleName: normalizeName(values.middleName) || null,
        lastName: normalizeName(values.lastName),
        email: values.email.trim(),
        password: values.password,
        confirmPassword: values.confirmPassword,
        jobRole,
      });
      showToast(`Welcome to ${COMPANY.name}, ${created.profile?.firstName ?? created.fullName}! Your account and onboarding checklist are ready.`);
      navigate(homePathForRole(created.role), { replace: true });
    } catch (caught) {
      setSubmitting(false);
      if (caught instanceof ApiError && caught.status === 409) {
        setEmailTaken(values.email.trim().toLowerCase());
        refs.email.current?.focus();
        return;
      }
      if (caught instanceof ApiError && caught.status === 422) {
        const { fields, other } = serverFieldErrors(caught);
        setServerErrors(fields);
        if (other.length) {
          setFormError(
            `The server didn't accept these details: ${other.join("; ")}. If the form looks right, the server may be running an older version of OnboardIQ. Restart it and try again.`,
          );
        }
        const firstField = SERVER_FIELDS.find((field) => fields[field]);
        if (firstField === "jobRole") jobRoleRef.current?.focus();
        else if (firstField) refs[firstField].current?.focus();
        return;
      }
      setFormError(caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <AuthLayout title="Sign up" heading="Sign up" subheading="Create your OnboardIQ employee account to start onboarding.">
      {formError && (
        <div role="alert" className="mt-6 flex gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 text-[13px] text-rose-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          {formError}
        </div>
      )}

      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4" aria-label="Create account">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="register-firstName" label="First name" error={shown("firstName")}>
            <input {...inputProps("firstName")} type="text" autoComplete="given-name" maxLength={100} className={authInputClass} placeholder="e.g. Priya" />
          </FormField>
          <FormField id="register-lastName" label="Last name" error={shown("lastName")}>
            <input {...inputProps("lastName")} type="text" autoComplete="family-name" maxLength={100} className={authInputClass} placeholder="e.g. Sharma" />
          </FormField>
        </div>
        <FormField
          id="register-middleName"
          label="Middle name (optional)"
          error={shown("middleName")}
          hint={fullName && !errors.firstName && !errors.lastName && !errors.middleName ? <p className="mt-1 text-[12px] text-slate-500">Your name will appear as “{fullName}”.</p> : null}
        >
          <input {...inputProps("middleName", false)} type="text" autoComplete="additional-name" maxLength={100} className={authInputClass} placeholder="Leave blank if you don't have one" />
        </FormField>

        <FormField
          id="register-email"
          label="Work email"
          error={shown("email")}
          hint={
            errors.email && emailTaken && touched.email && emailTaken === values.email.trim().toLowerCase() ? (
              <p className="mt-1 text-[12.5px] text-slate-500">
                <Link to="/login" state={{ email: values.email.trim() }} className="focus-ring rounded font-semibold text-primary-600 hover:underline">
                  Sign in instead
                </Link>{" "}
                or use a different email.
              </p>
            ) : null
          }
        >
          <input {...inputProps("email")} type="email" inputMode="email" autoComplete="email" maxLength={254} className={authInputClass} placeholder="name@company.com" />
        </FormField>

        <FormField
          id="register-jobRole"
          label="Job role"
          error={jobRoleShown}
          hint={<p className="mt-1 text-[12px] text-slate-500">Your onboarding checklist is tailored to this role. Choosing “HR” doesn't grant HR access.</p>}
        >
          <select
            id="register-jobRole"
            ref={jobRoleRef}
            value={jobRole}
            onChange={(e) => {
              setJobRole(e.target.value);
              setFormError(null);
              clearServerError("jobRole");
            }}
            onBlur={() => setJobRoleTouched(true)}
            required
            aria-invalid={Boolean(jobRoleShown)}
            aria-describedby={jobRoleShown ? "register-jobRole-error" : undefined}
            className={authInputClass}
          >
            <option value="">Select your role…</option>
            {JOB_ROLES.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          id="register-password"
          label="Password"
          error={shown("password")}
          hint={
            <ul id="password-requirements" aria-label="Password requirements" className="mt-2 grid gap-1 sm:grid-cols-2">
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
          }
        >
          <div className="relative">
            <input {...inputProps("password")} type={showPassword ? "text" : "password"} autoComplete="new-password" maxLength={128} className={`${authInputClass} pr-11`} />
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
        </FormField>

        <FormField id="register-confirmPassword" label="Confirm password" error={shown("confirmPassword")}>
          <input {...inputProps("confirmPassword")} type={showPassword ? "text" : "password"} autoComplete="new-password" maxLength={128} className={authInputClass} />
        </FormField>

        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : null}
          {submitting ? "Creating your account…" : "Create account"}
          {!submitting && <ArrowRight size={17} aria-hidden="true" />}
        </Button>
      </form>

      <p className="mt-5 text-center text-[13px] text-slate-500">
        Already have an account?{" "}
        <Link to="/login" className="focus-ring rounded font-semibold text-primary-600 underline-offset-2 hover:text-primary-700 hover:underline">
          Sign In
        </Link>
      </p>
    </AuthLayout>
  );
}
