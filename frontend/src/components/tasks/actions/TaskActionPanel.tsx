import { useCallback, useEffect, useState } from "react";
import { CircleCheck, LoaderCircle, Lock, Pause, Play, Timer } from "lucide-react";
import { useOnboarding } from "../../../context/OnboardingContext";
import { useToast } from "../../../context/ToastContext";
import { useTaskActions } from "../../../hooks/useTaskActions";
import { ApiError } from "../../../services/apiClient";
import { deleteTaskDocument, fetchTaskAction, submitTaskAction, uploadTaskDocument } from "../../../services/taskActionsApi";
import type { OnboardingTask } from "../../../types/dashboard";
import type { TaskActionState, TaskActionSubmission } from "../../../types/taskActions";
import { formatDate, formatDuration, formatTime } from "../../../utils/format";
import { getBlockingTasks } from "../../../utils/onboarding";
import { Button } from "../../ui/Button";
import { ErrorState } from "../../ui/ErrorState";
import { Skeleton } from "../../ui/Skeleton";
import { ChecklistAction } from "./ChecklistAction";
import { DocumentUploadAction } from "./DocumentUploadAction";
import { FormAction } from "./FormAction";
import { PolicyAcknowledgmentAction } from "./PolicyAcknowledgmentAction";
import { QuizForm } from "./QuizForm";
import { TrainingAction } from "./TrainingAction";

export interface ActionControls {
  state: TaskActionState;
  busy: boolean;
  error: string | null;
  fieldErrors: Record<string, string>;
  submit: (submission: TaskActionSubmission) => Promise<boolean>;
}

/** Live "time spent so far" for a task in progress: saved time plus the current active period (server timestamps). */
function useElapsed(task: OnboardingTask): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!task.activeSince) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [task.activeSince]);
  if (task.timeSpentSeconds == null) return null;
  const active = task.activeSince ? Math.max(0, Math.floor((now - new Date(task.activeSince).getTime()) / 1000)) : 0;
  return task.timeSpentSeconds + active;
}

/**
 * The work that completes a task: a form, uploads, a checklist, policy acknowledgments, training or a quiz.
 * The employee starts the task first (which starts its timer); the server validates every submission and decides
 * when the task is complete. Completion confirmed by the server is celebrated with the next recommended step.
 */
export function TaskActionPanel({ task }: { task: OnboardingTask }) {
  const { tasks, applyTask, celebrate, refreshTask } = useOnboarding();
  const { updateStatus, isSaving } = useTaskActions();
  const { showToast } = useToast();
  const [state, setState] = useState<TaskActionState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const blocking = task.status === "completed" ? [] : getBlockingTasks(task, tasks);
  const elapsed = useElapsed(task);

  useEffect(() => {
    const controller = new AbortController();
    setLoadError(null);
    setError(null);
    setFieldErrors({});
    fetchTaskAction(task.id, controller.signal)
      .then(setState)
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setLoadError(caught instanceof ApiError ? caught.message : "This task couldn't be loaded.");
      });
    return () => controller.abort();
  }, [task.id, reloadKey]);

  // Keep the panel in step when the status changes elsewhere (Start, Pause, Reopen).
  useEffect(() => {
    setState((current) => (current && current.task.status !== task.status ? { ...current, task, completed: task.status === "completed" } : current));
  }, [task]);

  const run = useCallback(
    async (operation: () => Promise<TaskActionState>): Promise<boolean> => {
      setBusy(true);
      setError(null);
      setFieldErrors({});
      try {
        const wasCompleted = state?.completed ?? false;
        const next = await operation();
        setState(next);
        applyTask(next.task);
        if (next.completed && !wasCompleted) celebrate(next.task);
        else if (next.message) showToast(next.message, "info");
        return true;
      } catch (caught) {
        const apiError = caught instanceof ApiError ? caught : null;
        setError(apiError?.message ?? "Something went wrong. Please try again.");
        setFieldErrors(apiError?.fields ?? {});
        return false;
      } finally {
        setBusy(false);
      }
    },
    [applyTask, celebrate, showToast, state?.completed],
  );

  if (loadError) {
    return (
      <div className="rounded-lg border border-line">
        <ErrorState title="Couldn't load this task" message={loadError} onRetry={() => setReloadKey((k) => k + 1)} />
      </div>
    );
  }
  if (!state) {
    return (
      <div className="space-y-2" role="status" aria-label="Loading task">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  // Locked until its prerequisite tasks are done (the server refuses it too).
  if (blocking.length > 0) {
    return (
      <section aria-label="Task locked" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-amber-900">
          <Lock size={15} aria-hidden="true" />
          This task unlocks after {blocking.map((t) => `“${t.title}”`).join(" and ")}.
        </p>
        <p className="mt-1 text-[12.5px] text-amber-800">Complete {blocking.length === 1 ? "it" : "them"} first. Your Next Step on the Home page always shows a task you can do now.</p>
      </section>
    );
  }

  // Not started yet: explain the task and let the employee start it (this starts the timer).
  if (task.status === "pending" && !state.completed) {
    return (
      <section aria-label="Start this task" className="space-y-3 rounded-lg border border-primary-100 bg-primary-50/60 px-4 py-4">
        <h4 className="text-[13px] font-semibold text-primary-700">What you'll do</h4>
        <p className="text-[13px] leading-relaxed text-slate-700">{state.instructions}</p>
        <Button onClick={() => void updateStatus(task, "in_progress")} disabled={isSaving(task)}>
          {isSaving(task) ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
          Start task
        </Button>
      </section>
    );
  }

  const controls: ActionControls = { state, busy, error, fieldErrors, submit: (submission) => run(() => submitTaskAction(task.id, submission)) };
  // Called when the quiz dialog closes after a pass: reload this panel and celebrate any task the server completed,
  // using the server's copy (so the time taken is accurate).
  const onPolicyQuizPassed = async (completedTaskIds: string[]) => {
    setReloadKey((k) => k + 1);
    for (const id of completedTaskIds) {
      const fresh = await refreshTask(id);
      if (fresh?.status === "completed") celebrate(fresh);
    }
  };

  return (
    <section aria-label="Complete this task" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[13px] font-semibold text-primary-700">What to do</h4>
        <div className="flex items-center gap-2">
          {busy && (
            <span className="inline-flex items-center gap-1 text-xs text-primary-600">
              <LoaderCircle size={12} className="animate-spin" aria-hidden="true" />
              Saving…
            </span>
          )}
          {task.status === "in_progress" && (
            <>
              {elapsed !== null && (
                <span className="inline-flex items-center gap-1 text-xs tabular-nums text-slate-500" title={task.activeSince ? `Started at ${formatTime(task.activeSince)}` : undefined}>
                  <Timer size={12} aria-hidden="true" />
                  {formatDuration(elapsed)}
                </span>
              )}
              <Button size="sm" variant="ghost" onClick={() => void updateStatus(task, "pending")} disabled={isSaving(task) || busy}>
                <Pause size={13} aria-hidden="true" />
                Pause
              </Button>
            </>
          )}
        </div>
      </div>
      {state.completed && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-emerald-50 px-3 py-2 text-[13px] font-medium text-emerald-800">
          <CircleCheck size={16} aria-hidden="true" />
          Completed{state.completedAt ? ` on ${formatDate(state.completedAt)}` : ""}
          {task.timeSpentSeconds != null && task.firstStartedAt ? ` · Completed in ${formatDuration(task.timeSpentSeconds)}` : ""}. You can review or update it below.
        </p>
      )}
      <p className="text-[13px] leading-relaxed text-slate-600">{state.instructions}</p>

      {state.actionType === "form" && <FormAction {...controls} />}
      {state.actionType === "checklist" && <ChecklistAction {...controls} />}
      {state.actionType === "document_upload" && (
        <DocumentUploadAction
          {...controls}
          taskId={task.id}
          upload={(documentType, file) => run(() => uploadTaskDocument(task.id, documentType, file))}
          remove={(documentId) => run(() => deleteTaskDocument(task.id, documentId))}
        />
      )}
      {state.actionType === "policy_acknowledgment" && <PolicyAcknowledgmentAction {...controls} onQuizPassed={(ids) => void onPolicyQuizPassed(ids)} />}
      {state.actionType === "training" && <TrainingAction {...controls} />}
      {state.actionType === "quiz" && state.quiz && <QuizForm quiz={state.quiz} busy={busy} onSubmit={(answers) => controls.submit({ answers })} />}

      {error && (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
          {error}
        </p>
      )}
    </section>
  );
}
