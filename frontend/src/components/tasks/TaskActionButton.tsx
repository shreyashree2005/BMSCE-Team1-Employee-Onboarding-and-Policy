import { ArrowRight, Check, Lock, Play, RotateCcw } from "lucide-react";
import { useOnboarding } from "../../context/OnboardingContext";
import { isBlocked } from "../../utils/onboarding";
import { useTaskActions } from "../../hooks/useTaskActions";
import type { OnboardingTask } from "../../types/dashboard";
import { Button } from "../ui/Button";

interface TaskActionButtonProps {
  task: OnboardingTask;
  size?: "sm" | "md";
  /** Opens the task's details, where its steps are completed. Omit when the details are already showing. */
  onOpen?: (task: OnboardingTask) => void;
}

/**
 * The single next step for a task: start it, continue it, or reopen it.
 * Tasks with an action (form, upload, checklist…) are completed only by finishing that action in the task details.
 */
export function TaskActionButton({ task, size = "sm", onOpen }: TaskActionButtonProps) {
  const { updateStatus, isSaving } = useTaskActions();
  const saving = isSaving(task);
  const { tasks } = useOnboarding();

  if (task.status !== "completed" && isBlocked(task, tasks)) {
    return (
      <Button size={size} variant="secondary" disabled title="Complete the prerequisite task first">
        <Lock size={14} aria-hidden="true" />
        Locked
      </Button>
    );
  }
  if (task.status === "pending") {
    return (
      <Button size={size} variant="secondary" disabled={saving} onClick={() => updateStatus(task, "in_progress")}>
        <Play size={14} aria-hidden="true" />
        Start
      </Button>
    );
  }
  if (task.status === "in_progress") {
    if (task.actionType) {
      if (!onOpen) return null;
      return (
        <Button size={size} variant="primary" onClick={() => onOpen(task)}>
          Continue
          <ArrowRight size={14} aria-hidden="true" />
        </Button>
      );
    }
    return (
      <Button size={size} variant="primary" disabled={saving} onClick={() => updateStatus(task, "completed")}>
        <Check size={14} aria-hidden="true" />
        Complete
      </Button>
    );
  }
  return (
    <Button size={size} variant="ghost" disabled={saving} onClick={() => updateStatus(task, "pending")}>
      <RotateCcw size={14} aria-hidden="true" />
      Reopen
    </Button>
  );
}
