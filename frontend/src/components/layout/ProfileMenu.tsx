import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LifeBuoy, LogOut, Settings, UserRound, type LucideIcon } from "lucide-react";
import { useAuth, useCurrentUser } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { getInitials } from "../../utils/format";
import { Dropdown } from "../ui/Dropdown";
import { UserAvatar } from "../ui/UserAvatar";

interface MenuItem {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
}

/** The circular profile photo in the top-right corner, with a small menu: name, job role, profile, settings, sign out. */
export function ProfileMenu() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { showToast } = useToast();
  const [signingOut, setSigningOut] = useState(false);
  const [first = "", ...rest] = user.fullName.split(" ");
  const initials = getInitials(user.profile?.firstName ?? first, user.profile?.lastName ?? rest.join(" "));
  const jobRole = user.role === "hr" ? "HR team" : (user.profile?.jobRoleLabel ?? user.profile?.jobTitle ?? "Employee");

  const items: MenuItem[] = [
    { label: "My Profile", icon: UserRound, onSelect: () => navigate("/profile") },
    { label: "Settings", icon: Settings, onSelect: () => navigate("/settings") },
    ...(user.role === "employee" ? [{ label: "Help Desk", icon: LifeBuoy, onSelect: () => navigate("/help") }] : []),
  ];

  const signOut = async () => {
    setSigningOut(true);
    await logout();
    showToast("You've been signed out.", "info");
    navigate("/login", { replace: true });
  };

  return (
    <Dropdown
      triggerLabel="Open profile menu"
      placement="bottom-end"
      triggerClassName="flex items-center rounded-full p-1 transition-transform duration-200 hover:scale-105"
      panelClassName="w-64"
      trigger={<UserAvatar photoUrl={user.photoUrl} initials={initials} size="header" ring />}
    >
      {(close) => (
        <>
          <div className="flex items-center gap-3 border-b border-primary-100 bg-gradient-to-br from-primary-50 to-white px-4 py-4">
            <UserAvatar photoUrl={user.photoUrl} initials={initials} size="lg" ring />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-navy-900">{user.fullName}</p>
              <p className="truncate text-xs font-medium text-primary-600">{jobRole}</p>
            </div>
          </div>
          <ul className="py-1.5">
            {items.map(({ label, icon: Icon, onSelect }) => (
              <li key={label}>
                <button
                  type="button"
                  onClick={() => {
                    close();
                    onSelect();
                  }}
                  className="group flex w-full items-center gap-3 px-4 py-2 text-[13px] text-slate-700 transition-colors hover:bg-primary-50 hover:text-primary-700 focus:bg-primary-50 focus:outline-none"
                >
                  <Icon size={16} className="text-primary-400 group-hover:text-primary-600" aria-hidden="true" />
                  {label}
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-line py-1.5">
            <button
              type="button"
              disabled={signingOut}
              onClick={() => {
                close();
                void signOut();
              }}
              className="flex w-full items-center gap-3 px-4 py-2 text-[13px] text-slate-700 hover:bg-surface focus:bg-surface focus:outline-none disabled:opacity-50"
            >
              <LogOut size={16} className="text-slate-400" aria-hidden="true" />
              {signingOut ? "Signing out…" : "Logout"}
            </button>
          </div>
        </>
      )}
    </Dropdown>
  );
}
