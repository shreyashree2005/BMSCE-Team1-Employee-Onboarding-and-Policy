import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, Inbox } from "lucide-react";
import { useCurrentUser } from "../../context/AuthContext";
import { useOnboarding } from "../../context/OnboardingContext";
import { fetchHrSummary } from "../../services/hrApi";
import type { Notification } from "../../types/dashboard";
import type { HrSummary } from "../../types/hr";
import { buildTaskNotifications } from "../../utils/activity";
import { Dropdown } from "../ui/Dropdown";
import { EmptyState } from "../ui/EmptyState";

function readStorageKey(userId: number): string {
  return `onboardiq.readNotifications.${userId}`;
}

function loadReadIds(userId: number): Set<string> {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(readStorageKey(userId)) ?? "[]");
    return new Set(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function hrNotifications(summary: HrSummary): Notification[] {
  const items: Notification[] = [];
  const { atRisk, notStarted } = summary.statusCounts;
  if (atRisk > 0) {
    items.push({
      id: `hr-at-risk-${atRisk}-${summary.overdueTasks}`,
      title: "Employees need follow-up",
      message: `${atRisk} employee${atRisk === 1 ? " has" : "s have"} ${summary.overdueTasks} overdue task${summary.overdueTasks === 1 ? "" : "s"} in total.`,
      time: "Now",
      read: false,
      link: "/hr?status=at_risk",
    });
  }
  if (notStarted > 0) {
    items.push({
      id: `hr-not-started-${notStarted}`,
      title: "Onboarding not started",
      message: `${notStarted} employee${notStarted === 1 ? " hasn't" : "s haven't"} completed any onboarding tasks yet.`,
      time: "Now",
      read: false,
      link: "/hr?status=not_started",
    });
  }
  return items;
}

/** Notifications computed from live data: the employee's deadlines, or for HR, employees needing attention. */
export function NotificationMenu() {
  const user = useCurrentUser();
  const { tasks, enabled: hasChecklist } = useOnboarding();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<HrSummary | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(() => loadReadIds(user.id));

  useEffect(() => {
    if (user.role !== "hr") return;
    const controller = new AbortController();
    fetchHrSummary(controller.signal)
      .then(setSummary)
      .catch(() => {
        // Notifications are a convenience; the HR dashboard shows its own error state.
      });
    return () => controller.abort();
  }, [user.role]);

  const notifications = useMemo(() => {
    const items = hasChecklist ? buildTaskNotifications(tasks) : summary ? hrNotifications(summary) : [];
    return items.map((n) => ({ ...n, read: readIds.has(n.id) }));
  }, [hasChecklist, tasks, summary, readIds]);
  const unreadCount = notifications.filter((n) => !n.read).length;

  const markRead = (ids: string[]) =>
    setReadIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      try {
        // Keep only IDs still relevant, so storage doesn't grow forever.
        const current = new Set(notifications.map((n) => n.id));
        window.localStorage.setItem(readStorageKey(user.id), JSON.stringify([...next].filter((id) => current.has(id))));
      } catch {
        // Storage unavailable: read state lasts for this visit only.
      }
      return next;
    });

  const openNotification = (notification: Notification, close: () => void) => {
    markRead([notification.id]);
    close();
    if (notification.link) navigate(notification.link);
  };

  return (
    <Dropdown
      triggerLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
      triggerClassName="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white hover:text-navy-900"
      panelClassName="w-[22rem]"
      trigger={
        <>
          <Bell size={19} aria-hidden="true" />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white ring-2 ring-white">
              {unreadCount}
            </span>
          )}
        </>
      }
    >
      {(close) => (
        <>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-navy-900">Notifications</p>
            <button
              type="button"
              onClick={() => markRead(notifications.map((n) => n.id))}
              disabled={unreadCount === 0}
              className="focus-ring flex items-center gap-1 rounded text-xs font-semibold text-primary-600 hover:text-primary-700 disabled:cursor-default disabled:text-slate-300"
            >
              <CheckCheck size={14} aria-hidden="true" />
              Mark all as read
            </button>
          </div>
          {notifications.length === 0 ? (
            <EmptyState icon={Inbox} title="No notifications" message="You're all caught up." />
          ) : (
            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => openNotification(notification, close)}
                    className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-surface focus:bg-surface focus:outline-none ${notification.read ? "" : "bg-primary-50/50"}`}
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.read ? "bg-transparent" : "bg-primary-500"}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold text-navy-900">{notification.title}</span>
                        <span className="shrink-0 text-[11px] text-slate-400">{notification.time}</span>
                      </span>
                      <span className="mt-0.5 block text-sm text-slate-500">{notification.message}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Dropdown>
  );
}
