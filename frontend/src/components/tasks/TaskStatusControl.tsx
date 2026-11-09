import { Circle, CircleCheck, CircleDot, LoaderCircle, type LucideIcon } from "lucide-react";
import { taskStatusMeta } from "../../config/taskMeta";
import { useTaskActions } from "../../hooks/useTaskActions";
import type { OnboardingTask, TaskStatus } from "../../types/dashboard";

const options: { status: TaskStatus; icon: LucideIcon; selectedClass: string }[] = [
  { status: "pending", icon: Circle, selectedClass: "bg-white text-navy-900 ring-1 ring-line-strong" },
  { status: "in_progress", icon: CircleDot, selectedClass: "bg-primary-500 text-white" },
  { status: "completed", icon: CircleCheck, selectedClass: "bg-emerald-500 text-white" },
];

/** Lets the employee set any status directly (used in the task details view). */
export function TaskStatusControl({ task }: { task: OnboardingTask }) {
  const { updateStatus, isSaving } = useTaskActions();
  const saving = isSaving(task);

  return (
    <div>
      <p id={`status-label-${task.id}`} className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
        Update status
        {saving && (
          <span className="inline-flex items-center gap-1 text-primary-600">
            <LoaderCircle size={12} className="animate-spin" aria-hidden="true" />
            Saving…
          </span>
        )}
      </p>
      <div role="radiogroup" aria-labelledby={`status-label-${task.id}`} className="grid grid-cols-3 gap-1 rounded-lg bg-surface p-1 ring-1 ring-inset ring-line">
        {options.map(({ status, icon: Icon, selectedClass }) => {
          const selected = task.status === status;
          return (
            <button
              key={status}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={saving}
              onClick={() => !selected && updateStatus(task, status)}
              className={`focus-ring flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-semibold transition-colors disabled:cursor-wait ${
                selected ? `${selectedClass} shadow-[0_1px_2px_rgb(20_43_74/0.1)]` : "text-slate-500 hover:bg-white hover:text-navy-900"
              }`}
            >
              <Icon size={14} aria-hidden="true" />
              {taskStatusMeta[status].label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
