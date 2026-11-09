import { MousePointerClick } from "lucide-react";
import type { OnboardingTask } from "../../types/dashboard";
import { TaskActionButton } from "../tasks/TaskActionButton";
import { TaskDetailContent } from "../tasks/TaskDetailContent";
import { EmptyState } from "../ui/EmptyState";

/** Inline task details for wide screens; narrow screens use TaskDetailModal instead. */
export function TaskDetailPanel({ task }: { task: OnboardingTask | undefined }) {
  return (
    <section aria-label="Task details" className="rounded-panel border border-primary-100 bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-primary-100 px-6 py-3.5">
        <h2 className="eyebrow text-primary-500">Task details</h2>
        {task && <TaskActionButton task={task} />}
      </div>
      {task ? (
        <div key={task.id} className="animate-fade-in px-6 py-5">
          <TaskDetailContent task={task} />
        </div>
      ) : (
        <EmptyState icon={MousePointerClick} title="Select a task" message="Choose a task from your checklist to see its details here." compact />
      )}
    </section>
  );
}
