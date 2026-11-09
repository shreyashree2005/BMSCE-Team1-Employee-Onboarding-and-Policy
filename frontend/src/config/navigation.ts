import type { LucideIcon } from "lucide-react";
import { ClipboardCheck, FileText, House, LifeBuoy, MessageSquareText, Settings, UserRound, Users } from "lucide-react";
import type { UserRole } from "../types/auth";

export type NavSection = "Workspace" | "Administration" | "Account";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  description: string;
  section: NavSection;
  /** Roles that may open this page. The API enforces the same rules; this only shapes the navigation. */
  roles: readonly UserRole[];
}

const EMPLOYEE: readonly UserRole[] = ["employee"];
const HR: readonly UserRole[] = ["hr"];
const EVERYONE: readonly UserRole[] = ["employee", "hr"];

export const navItems: NavItem[] = [
  { label: "Home", path: "/", icon: House, description: "Your guided onboarding: next step, today's tasks and progress.", section: "Workspace", roles: EMPLOYEE },
  { label: "All Tasks", path: "/onboarding", icon: ClipboardCheck, description: "Every onboarding task, with filters.", section: "Workspace", roles: EMPLOYEE },
  { label: "HR Dashboard", path: "/hr", icon: Users, description: "Monitor onboarding progress across new hires.", section: "Administration", roles: HR },
  { label: "Policy Assistant", path: "/policy-assistant", icon: MessageSquareText, description: "Ask questions and get answers sourced from approved company policies.", section: "Workspace", roles: EVERYONE },
  { label: "Documents", path: "/documents", icon: FileText, description: "Browse approved policy documents and search them by meaning.", section: "Workspace", roles: EVERYONE },
  { label: "Help Desk", path: "/help", icon: LifeBuoy, description: "Raise a support request and track its status.", section: "Workspace", roles: EVERYONE },
  { label: "My Profile", path: "/profile", icon: UserRound, description: "Your photo and employee details.", section: "Account", roles: EVERYONE },
  { label: "Settings", path: "/settings", icon: Settings, description: "Guidance, session and account settings.", section: "Account", roles: EVERYONE },
];

const SECTION_ORDER: Record<UserRole, NavSection[]> = {
  employee: ["Workspace", "Account"],
  hr: ["Administration", "Workspace", "Account"],
};

export function navItemsForRole(role: UserRole): NavItem[] {
  return navItems.filter((item) => item.roles.includes(role));
}

export function navSectionsForRole(role: UserRole): NavSection[] {
  return SECTION_ORDER[role];
}

/** Where each role lands after signing in. */
export function homePathForRole(role: UserRole): string {
  return role === "hr" ? "/hr" : "/";
}

export function getNavItem(path: string): NavItem {
  const item = navItems.find((nav) => nav.path === path);
  if (!item) throw new Error(`Unknown navigation path: ${path}`);
  return item;
}

export function canAccessPath(role: UserRole, pathname: string): boolean {
  const item = navItems.find((nav) => nav.path === pathname);
  return !item || item.roles.includes(role);
}
