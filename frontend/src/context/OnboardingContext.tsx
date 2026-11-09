import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError } from "../services/apiClient";
import { fetchOnboardingTask, fetchOnboardingTasks, updateOnboardingTaskStatus } from "../services/onboardingApi";
import type { OnboardingTask, RecentActivityItem, TaskStatus } from "../types/dashboard";
import { buildRecentActivity } from "../utils/activity";

export type LoadState = "loading" | "ready" | "error";

export type StatusUpdateResult = { ok: true } | { ok: false; message: string };

interface OnboardingContextValue {
  /** False for users without a personal checklist (HR); tasks are then always empty. */
  enabled: boolean;
  tasks: OnboardingTask[];
  loadState: LoadState;
  loadError: string | null;
  reload: () => void;
  /** Started and completed tasks, most recent first (from the server's timestamps). */
  activity: RecentActivityItem[];
  /** Ids of tasks whose status change is being saved. */
  savingTaskIds: ReadonlySet<string>;
  setTaskStatus: (taskId: string, status: TaskStatus) => Promise<StatusUpdateResult>;
  /** Replaces a task with the server's latest copy (e.g. after completing its action). */
  applyTask: (task: OnboardingTask) => void;
  /** Re-reads one task from the server (e.g. after a policy quiz completed it). */
  refreshTask: (taskId: string) => Promise<OnboardingTask | null>;
  /** The task whose server-confirmed completion is being celebrated, if any. */
  celebration: OnboardingTask | null;
  celebrate: (task: OnboardingTask) => void;
  dismissCelebration: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong. Please try again.";
}

/**
 * Loads the signed-in employee's onboarding checklist from the API and shares it across pages.
 * Status changes are applied optimistically and rolled back if the server rejects them.
 * Mount it once per signed-in user (keyed by user ID) so one account's data never leaks into another's.
 */
export function OnboardingProvider({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [loadState, setLoadState] = useState<LoadState>(enabled ? "loading" : "ready");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [savingTaskIds, setSavingTaskIds] = useState<ReadonlySet<string>>(new Set());
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setLoadState("loading");
    setLoadError(null);
    fetchOnboardingTasks(controller.signal)
      .then((loaded) => {
        setTasks(loaded);
        setLoadState("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(errorMessage(error));
        setLoadState("error");
      });
    return () => controller.abort();
  }, [reloadCount, enabled]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  const setSaving = (taskId: string, saving: boolean) =>
    setSavingTaskIds((prev) => {
      const next = new Set(prev);
      if (saving) next.add(taskId);
      else next.delete(taskId);
      return next;
    });

  const setTaskStatus = useCallback(async (taskId: string, status: TaskStatus): Promise<StatusUpdateResult> => {
    const task = tasksRef.current.find((t) => t.id === taskId);
    if (!task) return { ok: false, message: "That task no longer exists." };
    if (task.status === status) return { ok: true };

    const previousStatus = task.status;
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
    setSaving(taskId, true);
    try {
      const saved = await updateOnboardingTaskStatus(taskId, status);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? saved : t)));
      return { ok: true };
    } catch (error) {
      // Roll back unless another change has already replaced the optimistic status.
      setTasks((prev) => prev.map((t) => (t.id === taskId && t.status === status ? { ...t, status: previousStatus } : t)));
      return { ok: false, message: errorMessage(error) };
    } finally {
      setSaving(taskId, false);
    }
  }, []);

  const applyTask = useCallback((task: OnboardingTask) => setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t))), []);

  const refreshTask = useCallback(
    async (taskId: string) => {
      try {
        const fresh = await fetchOnboardingTask(taskId);
        applyTask(fresh);
        return fresh;
      } catch {
        return null; // not critical: the next full load picks the change up
      }
    },
    [applyTask],
  );

  // Celebrate only completions the server confirmed (callers pass the server's copy) and only once per completion.
  const [celebration, setCelebration] = useState<OnboardingTask | null>(null);
  const celebrate = useCallback((task: OnboardingTask) => {
    if (task.status === "completed") setCelebration(task);
  }, []);
  const dismissCelebration = useCallback(() => setCelebration(null), []);

  const activity = useMemo(() => buildRecentActivity(tasks), [tasks]);

  const value = useMemo(
    () => ({ enabled, tasks, loadState, loadError, reload, activity, savingTaskIds, setTaskStatus, applyTask, refreshTask, celebration, celebrate, dismissCelebration }),
    [enabled, tasks, loadState, loadError, reload, activity, savingTaskIds, setTaskStatus, applyTask, refreshTask, celebration, celebrate, dismissCelebration],
  );
  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingContextValue {
  const context = useContext(OnboardingContext);
  if (!context) throw new Error("useOnboarding must be used inside OnboardingProvider");
  return context;
}
