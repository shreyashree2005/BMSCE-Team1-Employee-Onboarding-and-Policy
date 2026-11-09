import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { homePathForRole } from "../../config/navigation";
import { useAuth } from "../../context/AuthContext";
import type { UserRole } from "../../types/auth";
import { BrandMark } from "../ui/BrandMark";
import { ButtonLink } from "../ui/Button";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { ErrorState } from "../ui/ErrorState";

/** Full-page state shown while the session is restored or when the server can't be reached. */
export function FullPageStatus({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-4">
      {children}
    </div>
  );
}

export function SessionCheck() {
  return (
    <FullPageStatus>
      <div role="status" className="flex flex-col items-center gap-4 text-center">
        <span className="animate-pulse">
          <BrandMark size={44} />
        </span>
        <p className="text-[13px] font-medium text-slate-500">Restoring your session…</p>
      </div>
    </FullPageStatus>
  );
}

/** Renders child routes only for signed-in users; otherwise sends them to sign in (and back afterwards). */
export function RequireAuth() {
  const { status, retry, signedOut } = useAuth();
  const location = useLocation();

  if (status === "checking") return <SessionCheck />;
  if (status === "unavailable") {
    return (
      <FullPageStatus>
        <div className="w-full max-w-md rounded-panel border border-line bg-white shadow-card">
          <ErrorState
            title="Can't reach OnboardIQ"
            message="We couldn't check your session because the server isn't responding. Make sure the backend is running, then try again."
            onRetry={retry}
          />
        </div>
      </FullPageStatus>
    );
  }
  if (status === "anonymous") {
    // Remember the requested page (deep link or expired session), but not after an explicit sign-out.
    return <Navigate to="/login" replace state={signedOut ? undefined : { from: `${location.pathname}${location.search}` }} />;
  }
  return <Outlet />;
}

/** Shows a clear "no access" page when a signed-in user opens a page outside their role. The API enforces the same rule. */
export function RequireRole({ roles }: { roles: readonly UserRole[] }) {
  const { user } = useAuth();
  if (!user) return null;
  if (roles.includes(user.role)) return <Outlet />;
  return (
    <Card>
      <EmptyState
        icon={ShieldAlert}
        title="You don't have access to this page"
        message={user.role === "hr" ? "This page is for employees completing their own onboarding." : "This page is only available to the HR team."}
        action={<ButtonLink to={homePathForRole(user.role)}>Go to your dashboard</ButtonLink>}
      />
    </Card>
  );
}

/** "/" is the employee overview; HR users land on the HR dashboard instead. */
export function RoleHome({ employee }: { employee: ReactNode }) {
  const { user } = useAuth();
  if (user?.role === "hr") return <Navigate to="/hr" replace />;
  return <>{employee}</>;
}
