import { DEMO_TODAY } from "../config/demo";
import { STAGE_ORDER } from "../config/stages";
import type { OnboardingStageProgress, OnboardingTask, StageStatus, TaskCategory, TaskPriority, TaskStatus } from "../types/dashboard";
import { daysBetween, formatLongDate } from "./format";

export type TaskFilter = "all" | TaskStatus;

export function sortByDueDate(tasks: OnboardingTask[]): OnboardingTask[] {
  return [...tasks].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Open work first (earliest due date first), then completed tasks (most recent first). */
export function sortForDisplay(tasks: OnboardingTask[]): OnboardingTask[] {
  const open = sortByDueDate(tasks.filter((task) => task.status !== "completed"));
  const done = sortByDueDate(tasks.filter((task) => task.status === "completed")).reverse();
  return [...open, ...done];
}

export function isOverdue(task: OnboardingTask, today: string = DEMO_TODAY): boolean {
  return task.status !== "completed" && task.dueDate < today;
}

export function filterTasksByStatus(tasks: OnboardingTask[], filter: TaskFilter): OnboardingTask[] {
  return filter === "all" ? tasks : tasks.filter((task) => task.status === filter);
}

export function getTaskCounts(tasks: OnboardingTask[]) {
  const completed = tasks.filter((t) => t.status === "completed").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  return {
    total: tasks.length,
    completed,
    inProgress,
    pending: tasks.length - completed - inProgress,
    remaining: tasks.length - completed,
    overdue: tasks.filter((t) => isOverdue(t)).length,
  };
}

/** The first stage that is not fully complete is "current"; later incomplete stages are "upcoming". */
export function getStageProgress(tasks: OnboardingTask[]): OnboardingStageProgress[] {
  let currentAssigned = false;
  return STAGE_ORDER.map((name) => {
    const stageTasks = tasks.filter((task) => task.stage === name);
    const completedTasks = stageTasks.filter((task) => task.status === "completed").length;
    let status: StageStatus = "completed";
    if (completedTasks < stageTasks.length) {
      status = currentAssigned ? "upcoming" : "current";
      currentAssigned = true;
    }
    return { name, completedTasks, totalTasks: stageTasks.length, status };
  });
}

const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

/** Prerequisite tasks of `task` that aren't completed yet (the server enforces the same rule). */
export function getBlockingTasks(task: OnboardingTask, tasks: OnboardingTask[]): OnboardingTask[] {
  const ids = new Set(task.dependsOn ?? []);
  return tasks.filter((t) => ids.has(t.id) && t.status !== "completed");
}

export function isBlocked(task: OnboardingTask, tasks: OnboardingTask[]): boolean {
  return task.status !== "completed" && getBlockingTasks(task, tasks).length > 0;
}

/**
 * Open tasks in the order we recommend doing them:
 * 1. tasks whose prerequisites are done before blocked ones;
 * 2. by deadline (anything overdue counts as due today, so importance decides among urgent tasks);
 * 3. a task already in progress before one not started (finish what you began);
 * 4. by priority (high, medium, low), then by catalog order.
 */
export function getRecommendedTasks(tasks: OnboardingTask[], today: string = DEMO_TODAY): OnboardingTask[] {
  const key = (t: OnboardingTask) => [
    isBlocked(t, tasks) ? 1 : 0,
    t.dueDate < today ? today : t.dueDate,
    t.status === "in_progress" ? 0 : 1,
    PRIORITY_RANK[t.priority],
    t.sequence ?? 0,
  ];
  return tasks
    .filter((t) => t.status !== "completed")
    .map((t) => ({ t, k: key(t) }))
    .sort((a, b) => {
      for (let i = 0; i < a.k.length; i++) {
        if (a.k[i] < b.k[i]) return -1;
        if (a.k[i] > b.k[i]) return 1;
      }
      return a.t.id.localeCompare(b.t.id);
    })
    .map(({ t }) => t);
}

/** The single task we recommend next ("Your Next Step"). */
export function getNextTask(tasks: OnboardingTask[], today: string = DEMO_TODAY): OnboardingTask | undefined {
  return getRecommendedTasks(tasks, today)[0];
}

/** Today's work: open tasks due today or earlier (in recommended order), then tasks due today that are done. */
export function getTodayTasks(tasks: OnboardingTask[], today: string = DEMO_TODAY): OnboardingTask[] {
  const open = getRecommendedTasks(tasks, today).filter((t) => t.dueDate <= today);
  const doneToday = tasks.filter((t) => t.status === "completed" && t.dueDate === today);
  return [...open, ...doneToday];
}

export type CompletionKind = "task" | "day" | "journey";

export interface CompletionMessage {
  kind: CompletionKind;
  title: string;
  message: string;
  next?: OnboardingTask;
}

/**
 * What to say after the server confirms a task is complete. `tasks` must already include the completed task.
 * - every task done: the journey is complete;
 * - nothing left that is due today (or overdue): today's work is done;
 * - otherwise: congratulate and point to the next recommended task.
 */
export function getCompletionMessage(tasks: OnboardingTask[], today: string = DEMO_TODAY): CompletionMessage {
  const recommended = getRecommendedTasks(tasks, today);
  if (recommended.length === 0) {
    return { kind: "journey", title: "Congratulations! 🎉", message: "You've successfully completed your onboarding journey. Welcome to the team!" };
  }
  const next = recommended[0];
  if (!recommended.some((t) => t.dueDate <= today)) {
    const tomorrow = addDaysIso(today, 1);
    const when = next.dueDate === tomorrow ? "See you tomorrow!" : `Your next task is due on ${formatLongDate(next.dueDate)}.`;
    return { kind: "day", title: "Great job! 🎉", message: `You've completed all your tasks for today. ${when}`, next };
  }
  return { kind: "task", title: "Congratulations! 🎉", message: "You've completed this task. Let's move on to your next step.", next };
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export function getCategoryProgress(tasks: OnboardingTask[]) {
  const byCategory = new Map<TaskCategory, { completed: number; total: number }>();
  for (const task of tasks) {
    const entry = byCategory.get(task.category) ?? { completed: 0, total: 0 };
    entry.total += 1;
    if (task.status === "completed") entry.completed += 1;
    byCategory.set(task.category, entry);
  }
  return [...byCategory.entries()].map(([category, counts]) => ({ category, ...counts }));
}

/** Open tasks due from today up to `days` days ahead (overdue tasks excluded). */
export type DueTone = "overdue" | "soon" | "later" | "done";

/** Human-friendly due label, e.g. "Overdue 2d", "Today", "In 3 days" or "Nov 20". */
export function describeDue(task: OnboardingTask, today: string = DEMO_TODAY): { label: string; tone: DueTone } {
  if (task.status === "completed") return { label: "Done", tone: "done" };
  const offset = daysBetween(today, task.dueDate);
  if (offset < 0) return { label: `Overdue ${Math.abs(offset)}d`, tone: "overdue" };
  if (offset === 0) return { label: "Due today", tone: "soon" };
  if (offset === 1) return { label: "Tomorrow", tone: "soon" };
  if (offset <= 3) return { label: `In ${offset} days`, tone: "soon" };
  if (offset <= 14) return { label: `In ${offset} days`, tone: "later" };
  const date = new Date(task.dueDate + "T00:00:00");
  return { label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }), tone: "later" };
}

// ───────────── Grouping: Status → Priority → Tasks ─────────────

export const PRIORITY_ORDER: TaskPriority[] = ["high", "medium", "low"];

export interface PriorityGroup {
  priority: TaskPriority;
  tasks: OnboardingTask[];
}

/**
 * Tasks grouped by priority (high, medium, low), empty groups left out. Within a group tasks keep the given order,
 * or are sorted for display (open work by due date, then completed) when `sort` is true.
 */
export function groupByPriority(tasks: OnboardingTask[], sort = true): PriorityGroup[] {
  const ordered = sort ? sortForDisplay(tasks) : tasks;
  return PRIORITY_ORDER.map((priority) => ({ priority, tasks: ordered.filter((t) => t.priority === priority) })).filter((g) => g.tasks.length > 0);
}

export interface TodayOverview {
  /** Open tasks due today (and overdue ones, which still need doing today), grouped by priority. */
  active: PriorityGroup[];
  activeCount: number;
  /** Tasks due today that are already completed. */
  completed: OnboardingTask[];
}

/** Today's work for the Home page. Tasks due on later days are never included. */
export function getTodayOverview(tasks: OnboardingTask[], today: string = DEMO_TODAY): TodayOverview {
  // Recommended order inside each priority group: unblocked first, overdue first, in progress first, catalog order.
  const open = getRecommendedTasks(tasks, today).filter((t) => t.dueDate <= today);
  return {
    active: groupByPriority(open, false),
    activeCount: open.length,
    completed: tasks.filter((t) => t.status === "completed" && t.dueDate === today),
  };
}
