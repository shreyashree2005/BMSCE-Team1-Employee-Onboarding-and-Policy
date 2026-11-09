import { NavLink } from "react-router-dom";
import { ChevronsLeft, ChevronsRight, X } from "lucide-react";
import { navItemsForRole, navSectionsForRole } from "../../config/navigation";
import { useCurrentUser } from "../../context/AuthContext";
import { useOnboarding } from "../../context/OnboardingContext";
import { percentage } from "../../utils/format";
import { getTaskCounts } from "../../utils/onboarding";
import { BrandMark, BrandWordmark } from "../ui/BrandMark";
import { ProgressBar } from "../ui/ProgressBar";

interface SidebarProps {
  mobileOpen: boolean;
  collapsed: boolean;
  onClose: () => void;
  onToggleCollapsed: () => void;
}

export function Sidebar({ mobileOpen, collapsed, onClose, onToggleCollapsed }: SidebarProps) {
  const user = useCurrentUser();
  const { tasks, loadState, enabled: hasChecklist } = useOnboarding();
  const items = navItemsForRole(user.role);
  const ready = loadState === "ready";
  const counts = getTaskCounts(tasks);
  const progress = percentage(counts.completed, counts.total);
  // Collapsing only applies to the desktop sidebar; the mobile drawer always shows labels.
  const compact = collapsed && !mobileOpen;
  const hideOnCompact = compact ? "lg:hidden" : "";

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-navy-950/40 backdrop-blur-[2px] transition-opacity duration-200 lg:hidden ${mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[17rem] shrink-0 flex-col bg-gradient-to-b from-primary-700 via-primary-700 to-primary-800 text-white shadow-[4px_0_24px_-12px_rgb(27_63_140/0.45)] transition-[transform,width] duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)] lg:sticky lg:top-0 lg:z-0 lg:h-screen lg:translate-x-0 ${
          mobileOpen ? "translate-x-0 shadow-pop" : "-translate-x-full"
        } ${compact ? "lg:w-[4.75rem]" : "lg:w-[16.5rem]"}`}
        aria-label="Main navigation"
      >
        {/* Brand */}
        <div className={`flex h-16 shrink-0 items-center justify-between gap-2 border-b border-white/10 px-5 sm:h-[72px] ${compact ? "lg:justify-center lg:px-0" : ""}`}>
          <span className={hideOnCompact}>
            <BrandWordmark tone="light" />
          </span>
          {compact && (
            <span className="hidden lg:block">
              <BrandMark />
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-primary-100 hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Close navigation menu"
          >
            <X size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={`focus-ring hidden h-7 w-7 items-center justify-center rounded-md text-primary-200 transition-colors hover:bg-white/10 hover:text-white lg:flex ${compact ? "lg:hidden" : ""}`}
            aria-label="Collapse sidebar"
          >
            <ChevronsLeft size={16} aria-hidden="true" />
          </button>
        </div>

        {compact && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="focus-ring mx-auto mb-2 mt-2 hidden h-7 w-7 items-center justify-center rounded-md text-primary-200 hover:bg-white/10 hover:text-white lg:flex"
            aria-label="Expand sidebar"
          >
            <ChevronsRight size={16} aria-hidden="true" />
          </button>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-5">
          {navSectionsForRole(user.role).map((section) => (
            <div key={section} className="mb-6 last:mb-0">
              <p className={`eyebrow mb-2 px-3 text-primary-200/90 ${compact ? "lg:sr-only" : ""}`}>{section}</p>
              <ul className="space-y-1">
                {items
                  .filter((item) => item.section === section)
                  .map(({ label, path, icon: Icon }) => (
                    <li key={path}>
                      <NavLink
                        to={path}
                        end={path === "/"}
                        onClick={onClose}
                        title={compact ? label : undefined}
                        className={({ isActive }) =>
                          `focus-ring group relative flex h-10 items-center gap-3 rounded-lg px-3 text-[13.5px] transition-colors duration-150 ${
                            isActive ? "bg-white font-semibold text-primary-700 shadow-[0_6px_16px_-6px_rgb(13_31_56/0.45)]" : "font-medium text-white/90 hover:bg-white/10 hover:text-white"
                          } ${compact ? "lg:justify-center lg:px-0" : ""}`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <span
                              className={`absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-white transition-opacity ${isActive ? "opacity-100" : "opacity-0"}`}
                              aria-hidden="true"
                            />
                            <Icon size={18} strokeWidth={isActive ? 2.2 : 1.9} className={isActive ? "text-primary-600" : "text-primary-100 group-hover:text-white"} aria-hidden="true" />
                            <span className={compact ? "lg:sr-only" : ""}>{label}</span>
                            {path === "/onboarding" && counts.remaining > 0 && (
                              <span
                                className={`ml-auto min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10.5px] font-semibold leading-none tabular-nums ${isActive ? "bg-primary-600 text-white" : "bg-white/20 text-white"} ${
                                  compact ? "lg:absolute lg:right-2 lg:top-1 lg:ml-0" : ""
                                }`}
                                aria-label={`${counts.remaining} tasks remaining`}
                              >
                                {counts.remaining}
                              </span>
                            )}
                          </>
                        )}
                      </NavLink>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Onboarding progress module (employees only) */}
        {hasChecklist && (
        <div className={`relative mx-3 mb-3 overflow-hidden rounded-panel bg-white/10 p-4 text-white ring-1 ring-inset ring-white/15 backdrop-blur-sm ${hideOnCompact}`}>
          <span className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-white/10" aria-hidden="true" />
          <div className="flex items-baseline justify-between">
            <p className="text-xs font-medium text-white/85">Your onboarding</p>
            {ready ? (
              <p className="text-sm font-semibold tabular-nums">{progress}%</p>
            ) : loadState === "loading" ? (
              <span className="h-4 w-8 animate-pulse rounded bg-white/15" aria-hidden="true" />
            ) : (
              <p className="text-sm font-semibold text-white/50">—</p>
            )}
          </div>
          <div className="mt-2.5">
            <ProgressBar value={ready ? progress : 0} size="sm" track="dark" tone="white" label="Your onboarding progress" />
          </div>
          <p className="mt-2.5 text-[11px] text-white/80">
            {loadState === "loading"
              ? "Loading checklist…"
              : loadState === "error"
                ? "Checklist unavailable"
                : counts.remaining > 0
                  ? `${counts.remaining} tasks left · ${counts.overdue} overdue`
                  : "All tasks complete"}
          </p>
        </div>
        )}

      </aside>
    </>
  );
}
