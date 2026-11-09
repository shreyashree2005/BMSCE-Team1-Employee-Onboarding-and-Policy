import type { OnboardingTask } from "../../types/dashboard";
import { getTaskCounts, type TaskFilter } from "../../utils/onboarding";
import type { SegmentedTabOption } from "../ui/SegmentedTabs";

/** Filter tab definitions (with live counts) shared by every task list. */
export function getTaskFilterOptions(tasks: OnboardingTask[]): SegmentedTabOption<TaskFilter>[] {
  const counts = getTaskCounts(tasks);
  return [
    { value: "all", label: "All", count: counts.total },
    { value: "pending", label: "Pending", count: counts.pending },
    { value: "in_progress", label: "In Progress", count: counts.inProgress },
    { value: "completed", label: "Completed", count: counts.completed },
  ];
}

export const emptyFilterMessages: Record<TaskFilter, { title: string; message: string }> = {
  all: { title: "No tasks found", message: "Try adjusting your search or filters." },
  pending: { title: "Nothing pending", message: "Every task has been started or completed." },
  in_progress: { title: "No tasks in progress", message: "Start a pending task to see it here." },
  completed: { title: "No completed tasks yet", message: "Tasks you complete will appear here." },
};
