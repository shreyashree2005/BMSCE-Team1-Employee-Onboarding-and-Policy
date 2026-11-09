import { useCallback } from "react";
import { useOnboarding } from "../context/OnboardingContext";
import { useToast } from "../context/ToastContext";
import type { OnboardingTask, TaskStatus } from "../types/dashboard";

const toastMessages: Record<TaskStatus, (title: string) => string> = {
  in_progress: (title) => `Started “${title}”.`,
  completed: (title) => `Marked “${title}” as complete.`,
  pending: (title) => `Reopened “${title}”.`,
};

/** Saves a task's status through the API and confirms the outcome with a toast. */
export function useTaskActions() {
  const { setTaskStatus, savingTaskIds } = useOnboarding();
  const { showToast } = useToast();

  const updateStatus = useCallback(
    async (task: OnboardingTask, status: TaskStatus) => {
      const result = await setTaskStatus(task.id, status);
      if (result.ok) showToast(toastMessages[status](task.title));
      else showToast(`Couldn't update “${task.title}”. ${result.message}`, "error");
    },
    [setTaskStatus, showToast],
  );

  const isSaving = useCallback((task: OnboardingTask) => savingTaskIds.has(task.id), [savingTaskIds]);

  return { updateStatus, isSaving };
}
