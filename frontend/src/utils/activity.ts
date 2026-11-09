/**
 * Activity, deadline and notification feeds derived from the employee's real checklist (task statuses,
 * due dates and the server's `updatedAt` timestamps), so nothing on the dashboard is mock data.
 */
import { DEMO_TODAY } from "../config/demo";
import type { Notification, OnboardingTask, RecentActivityItem, RecentActivityKind, TaskCategory } from "../types/dashboard";
import { formatShortDate } from "./format";
import { isOverdue, sortByDueDate } from "./onboarding";

const timeFormatter = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const dayTimeFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** "Just now", "12 min ago", "Today, 9:42 AM", "Yesterday, 5:10 PM" or "Nov 5, 9:42 AM". */
export function formatRelativeTimestamp(isoTimestamp: string, now: Date = new Date()): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return "";
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (date.getTime() >= startOfToday) return `Today, ${timeFormatter.format(date)}`;
  if (date.getTime() >= startOfToday - 86_400_000) return `Yesterday, ${timeFormatter.format(date)}`;
  return dayTimeFormatter.format(date);
}

const activityKind: Partial<Record<TaskCategory, RecentActivityKind>> = {
  Learning: "training",
  Compliance: "training",
  Documents: "document",
  "HR Forms": "document",
  Payroll: "document",
  Team: "event",
  Orientation: "event",
};

/** Started and completed tasks, most recently changed first. */
export function buildRecentActivity(tasks: OnboardingTask[], now: Date = new Date()): RecentActivityItem[] {
  return tasks
    .filter((task) => task.status !== "pending" && task.updatedAt)
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
    .map((task) => ({
      id: `${task.id}-${task.status}`,
      kind: activityKind[task.category] ?? "task",
      title: `${task.status === "completed" ? "Completed" : "Started"} “${task.title}”`,
      detail: task.category,
      timestamp: formatRelativeTimestamp(task.updatedAt as string, now),
    }));
}

const SOON_DAYS = 3;

/** Overdue tasks and tasks due within three days. IDs are stable so read state can be remembered. */
export function buildTaskNotifications(tasks: OnboardingTask[], today: string = DEMO_TODAY): Notification[] {
  const soonLimit = new Date(`${today}T00:00:00`);
  soonLimit.setDate(soonLimit.getDate() + SOON_DAYS);
  const soonIso = `${soonLimit.getFullYear()}-${String(soonLimit.getMonth() + 1).padStart(2, "0")}-${String(soonLimit.getDate()).padStart(2, "0")}`;

  const overdue = tasks.filter((task) => isOverdue(task, today));
  const dueSoon = tasks.filter((task) => task.status !== "completed" && task.dueDate >= today && task.dueDate <= soonIso);
  return [
    ...sortByDueDate(overdue).map((task) => ({
      id: `overdue-${task.id}-${task.dueDate}`,
      title: "Task overdue",
      message: `“${task.title}” was due on ${formatShortDate(task.dueDate)}.`,
      time: formatShortDate(task.dueDate),
      read: false,
      link: `/onboarding?task=${encodeURIComponent(task.id)}`,
    })),
    ...sortByDueDate(dueSoon).map((task) => ({
      id: `soon-${task.id}-${task.dueDate}`,
      title: task.dueDate === today ? "Due today" : "Due soon",
      message: `“${task.title}” is due on ${formatShortDate(task.dueDate)}.`,
      time: formatShortDate(task.dueDate),
      read: false,
      link: `/onboarding?task=${encodeURIComponent(task.id)}`,
    })),
  ];
}
