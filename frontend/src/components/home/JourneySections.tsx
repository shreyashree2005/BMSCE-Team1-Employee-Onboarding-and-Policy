import { Link } from "react-router-dom";
import { ArrowRight, CircleCheck } from "lucide-react";
import type { OnboardingStageName, OnboardingStageProgress } from "../../types/dashboard";
import { percentage } from "../../utils/format";
import { SectionIllustration, type IllustrationName } from "../illustrations/SectionIllustration";
import { SectionHeader } from "../ui/SectionHeader";

// The journey stages, named in plain language for employees, each with its own illustration.
const STAGE_CARDS: Record<OnboardingStageName, { title: string; illustration: IllustrationName; extra?: IllustrationName }> = {
  Welcome: { title: "Welcome & IT setup", illustration: "welcome" },
  Documentation: { title: "Documentation", illustration: "documentation" },
  "Payroll & Benefits": { title: "Payroll & Benefits", illustration: "payroll", extra: "benefits" },
  Training: { title: "Policies & Training", illustration: "training" },
  "Ready to Go": { title: "Ready to Go", illustration: "ready" },
};

/**
 * The onboarding journey at a glance: one card per stage with its illustration and progress (no task lists here).
 * Selecting a stage opens All Tasks filtered to it.
 */
export function JourneySections({ stages }: { stages: OnboardingStageProgress[] }) {
  return (
    <section aria-labelledby="journey-heading" className="rounded-panel border border-line bg-white p-5 shadow-card sm:p-6">
      <SectionHeader id="journey-heading" title="Your onboarding journey" description="Five stages from your first day to fully ready. Select a stage to see its tasks." />
      <ol className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {stages.map((stage, index) => {
          const card = STAGE_CARDS[stage.name];
          const pct = percentage(stage.completedTasks, stage.totalTasks);
          const done = stage.status === "completed" && stage.totalTasks > 0;
          const current = stage.status === "current";
          return (
            <li key={stage.name}>
              <Link
                to={`/onboarding?stage=${encodeURIComponent(stage.name)}`}
                aria-label={`${card.title}: ${stage.completedTasks} of ${stage.totalTasks} tasks done. View these tasks`}
                className={`focus-ring group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-white p-3 transition-[box-shadow,transform,border-color] duration-200 hover:-translate-y-1 hover:shadow-raised ${
                  current ? "border-primary-300 ring-2 ring-primary-100" : "border-line hover:border-primary-200"
                }`}
              >
                <span className="flex h-[104px] items-center justify-center rounded-xl bg-gradient-to-br from-primary-50 to-white">
                  <SectionIllustration name={card.illustration} className={card.extra ? "h-[92px] w-[74px]" : "h-[96px] w-[124px]"} />
                  {card.extra && <SectionIllustration name={card.extra} className="-ml-3 h-[92px] w-[74px]" />}
                </span>
                <span className="mt-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-primary-400">
                  Stage {index + 1}
                  {current && <span className="rounded-full bg-primary-600 px-1.5 py-0.5 text-[9.5px] text-white">Current</span>}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[14.5px] font-semibold leading-snug text-primary-800">
                  {card.title}
                  {done && <CircleCheck size={15} className="shrink-0 text-emerald-600" aria-hidden="true" />}
                </span>
                <span className="mt-auto pt-3">
                  <span className="flex items-center justify-between text-[11.5px] font-medium text-slate-500">
                    <span className="tabular-nums">
                      {stage.completedTasks}/{stage.totalTasks} done
                    </span>
                    <span className={`font-semibold tabular-nums ${done ? "text-emerald-700" : "text-primary-700"}`}>{pct}%</span>
                  </span>
                  <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-primary-50" aria-hidden="true">
                    <span className={`block h-full rounded-full ${done ? "bg-emerald-500" : "bg-gradient-to-r from-primary-400 to-primary-600"}`} style={{ width: `${pct}%` }} />
                  </span>
                </span>
                <ArrowRight size={15} className="absolute right-3 top-3 text-primary-300 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
