import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Compass, KeyRound, LogOut, PlayCircle, ShieldCheck, UserRound } from "lucide-react";
import { Button, buttonClasses } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { UserAvatar } from "../components/ui/UserAvatar";
import { COMPANY } from "../config/company";
import { useAuth, useCurrentUser } from "../context/AuthContext";
import { useGuidance } from "../context/GuidanceContext";
import { useToast } from "../context/ToastContext";
import { getInitials } from "../utils/format";

const permissions = {
  employee: ["Complete your own onboarding tasks", "Raise and track Help Desk tickets", "Ask the Policy Assistant", "Browse published policies and take their quizzes"],
  hr: ["View onboarding progress for all employees", "Work through Help Desk tickets", "Upload, search and delete policy documents", "Ask the Policy Assistant"],
} as const;

export function SettingsPage() {
  const user = useCurrentUser();
  const { logout } = useAuth();
  const { startTour, showCompanyIntro } = useGuidance();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [first = "", ...rest] = user.fullName.split(" ");

  const signOut = async () => {
    setSigningOut(true);
    await logout();
    showToast("You've been signed out.", "info");
    navigate("/login", { replace: true });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Settings" description="Guidance, access and your session." />

      <Card padding="none">
        <div className="flex flex-wrap items-center gap-4 px-5 py-5 sm:px-6">
          <UserAvatar photoUrl={user.photoUrl} initials={getInitials(user.profile?.firstName ?? first, user.profile?.lastName ?? rest.join(" "))} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-navy-900">{user.fullName}</p>
            <p className="truncate text-[13px] text-slate-500">{user.email}</p>
          </div>
          <Link to="/profile" className={buttonClasses("secondary", "sm")}>
            <UserRound size={14} aria-hidden="true" />
            My Profile
          </Link>
        </div>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        {user.role === "employee" && (
          <Card title="Guidance" subtitle="Replay the introductions any time">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] text-slate-600">A step-by-step tour of the portal.</p>
                <Button variant="secondary" size="sm" onClick={startTour}>
                  <Compass size={14} aria-hidden="true" />
                  Replay website tour
                </Button>
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] text-slate-600">An introduction to {COMPANY.name}, with an optional video.</p>
                <Button variant="secondary" size="sm" onClick={showCompanyIntro}>
                  <PlayCircle size={14} aria-hidden="true" />
                  Company introduction
                </Button>
              </div>
            </div>
          </Card>
        )}

        <Card title="Access" subtitle="What your role allows">
          <ul className="space-y-2.5">
            {permissions[user.role].map((item) => (
              <li key={item} className="flex gap-2.5 text-[13px] text-slate-600">
                <ShieldCheck size={16} className="mt-0.5 shrink-0 text-primary-500" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Session">
          <p className="flex gap-2.5 text-[13px] leading-relaxed text-slate-600">
            <KeyRound size={16} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
            You're signed in on this browser with a secure session cookie. Sessions end automatically after a period of time.
          </p>
          <Button variant="secondary" className="mt-4 w-full" onClick={signOut} disabled={signingOut}>
            <LogOut size={16} aria-hidden="true" />
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </Card>
      </div>
    </div>
  );
}
