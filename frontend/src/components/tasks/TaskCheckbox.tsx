import { Check, LoaderCircle } from "lucide-react";
import { useTaskActions } from "../../hooks/useTaskActions";
import type { OnboardingTask } from "../../types/dashboard";

interface TaskCheckboxProps {
  task: OnboardingTask;
  /** Opens the task details. Open tasks with an action are completed there, not by ticking the box. */
  onOpen: (task: OnboardingTask) => void;
}

/** Round status control: opens an actionable task, reopens a completed one, or toggles a simple task. */
export function TaskCheckbox({ task, onOpen }: TaskCheckboxProps) {
  const { updateStatus, isSaving } = useTaskActions();
  const saving = isSaving(task);
  const completed = task.status === "completed";
  const inProgress = task.status === "in_progress";
  const opensTask = !completed && Boolean(task.actionType);

  const onClick = () => {
    if (opensTask) onOpen(task);
    else void updateStatus(task, completed ? "pending" : "completed");
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving}
      aria-busy={saving}
      aria-label={completed ? `Mark “${task.title}” as not complete` : opensTask ? `Open “${task.title}” to complete it` : `Mark “${task.title}” as complete`}
      aria-pressed={opensTask ? undefined : completed}
      className={`focus-ring group/check flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full transition-all duration-200 active:scale-90 disabled:cursor-wait ${
        completed
          ? "bg-emerald-500 text-white"
          : inProgress
            ? "border-2 border-primary-500 bg-white hover:bg-primary-50"
            : "border-2 border-line-strong bg-white hover:border-primary-400"
      }`}
    >
      {saving ? (
        <LoaderCircle size={13} strokeWidth={3} className={`animate-spin ${completed ? "text-white" : "text-primary-500"}`} aria-hidden="true" />
      ) : completed ? (
        <Check size={13} strokeWidth={3} className="animate-scale-in" aria-hidden="true" />
      ) : inProgress ? (
        <span className="h-2 w-2 rounded-full bg-primary-500" aria-hidden="true" />
      ) : (
        <Check size={12} strokeWidth={3} className="text-primary-400 opacity-0 transition-opacity group-hover/check:opacity-100" aria-hidden="true" />
      )}
    </button>
  );
}
