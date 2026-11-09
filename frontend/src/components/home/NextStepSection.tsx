import { ArrowRight, CalendarClock, Flag, PartyPopper, Play, Sparkles } from "lucide-react";
import { taskCategoryIcons, taskPriorityMeta } from "../../config/taskMeta";
import type { OnboardingTask } from "../../types/dashboard";
import { describeDue } from "../../utils/onboarding";
import { Button } from "../ui/Button";
import { SectionHeader } from "../ui/SectionHeader";

interface NextStepSectionProps {
  task: OnboardingTask | undefined;
  starting: boolean;
  onStart: (task: OnboardingTask) => void;
}

const priorityPill: Record<OnboardingTask["priority"], string> = {
  high: "bg-rose-500/90 text-white",
  medium: "bg-amber-400 text-navy-950",
  low: "bg-white/20 text-white",
};

/** One clear recommendation: the task to do now (dependencies done, most urgent and important first). */
export function NextStepSection({ task, starting, onStart }: NextStepSectionProps) {
  if (!task) {
    return (
      <section aria-labelledby="next-step-heading" className="rounded-panel border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 shadow-card sm:p-6">
        <SectionHeader id="next-step-heading" title="Your Next Step" leading={<PartyPopper size={22} className="mt-0.5 text-emerald-600" aria-hidden="true" />} description="Every onboarding task is done. Welcome to the team!" />
      </section>
    );
  }
  const Icon = taskCategoryIcons[task.category];
  const due = describeDue(task);
  const label = task.status === "in_progress" ? "Continue task" : "Start Task";

  return (
    <section
      aria-labelledby="next-step-heading"
      className="relative overflow-hidden rounded-panel bg-gradient-to-br from-primary-600 via-primary-500 to-primary-700 p-5 text-white shadow-glow sm:p-6"
    >
      <span className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/10" aria-hidden="true" />
      <span className="pointer-events-none absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-white/[0.07]" aria-hidden="true" />
      <div className="relative">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-amber-300" aria-hidden="true" />
          <h2 id="next-step-heading" className="text-[17px] font-semibold tracking-tight text-white">
            Your Next Step
          </h2>
        </div>
        <p className="mt-0.5 text-[13px] text-primary-100">Recommended based on priority, deadlines and what each task depends on.</p>
        <div className="mt-4 flex flex-col gap-4 rounded-xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3.5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-primary-600 shadow-md">
              <Icon size={22} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[17px] font-semibold leading-snug text-white">{task.title}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-primary-50/90">{task.description}</p>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${priorityPill[task.priority]}`}>
                  <Flag size={11} aria-hidden="true" />
                  {taskPriorityMeta[task.priority].label} priority
                </span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${due.tone === "overdue" ? "bg-rose-500/90 text-white" : "bg-white/15 text-white"}`}>
                  <CalendarClock size={11} aria-hidden="true" />
                  {due.label}
                </span>
                {task.status === "in_progress" && <span className="rounded-full bg-white/15 px-2 py-0.5 font-medium text-white">In progress</span>}
              </p>
            </div>
          </div>
          <Button size="lg" variant="inverse" onClick={() => onStart(task)} disabled={starting} className="w-full sm:w-auto">
            {task.status === "in_progress" ? <ArrowRight size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
            {label}
          </Button>
        </div>
      </div>
    </section>
  );
}
