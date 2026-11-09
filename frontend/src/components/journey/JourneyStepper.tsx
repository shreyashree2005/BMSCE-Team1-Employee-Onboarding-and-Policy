import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { stageMeta } from "../../config/stages";
import type { OnboardingStageName, OnboardingStageProgress, StageStatus } from "../../types/dashboard";
import { percentage } from "../../utils/format";

interface JourneyStepperProps {
  stages: OnboardingStageProgress[];
  /** "detailed" adds stage descriptions and per-stage progress bars. */
  variant?: "compact" | "detailed";
  /** When provided, stages become buttons (e.g. to filter a checklist). */
  selected?: OnboardingStageName | null;
  onSelect?: (stage: OnboardingStageName | null) => void;
}

const nodeClasses: Record<StageStatus, string> = {
  completed: "bg-primary-500 text-white shadow-[0_4px_12px_-2px_rgb(52_111_231/0.5)]",
  current: "bg-white text-primary-500 ring-2 ring-primary-500",
  upcoming: "bg-white text-slate-400 ring-1 ring-line-strong",
};

function statusText(stage: OnboardingStageProgress): { label: string; className: string } {
  if (stage.status === "completed") return { label: "Completed", className: "text-emerald-600" };
  if (stage.status === "current") return { label: `In progress · ${stage.completedTasks}/${stage.totalTasks}`, className: "text-primary-600" };
  return { label: `Upcoming · ${stage.completedTasks}/${stage.totalTasks}`, className: "text-slate-500" };
}

/** Share of the connector after a stage that is filled, based on that stage's task completion. */
function connectorFill(stage: OnboardingStageProgress): number {
  return percentage(stage.completedTasks, stage.totalTasks);
}

function StageNode({ stage, size }: { stage: OnboardingStageProgress; size: "md" | "lg" }) {
  const Icon = stageMeta[stage.name].icon;
  const box = size === "lg" ? "h-12 w-12" : "h-11 w-11";
  return (
    <span className={`relative z-10 flex shrink-0 items-center justify-center rounded-full transition-colors ${box} ${nodeClasses[stage.status]}`} aria-hidden="true">
      {/* The pulse lives on its own layer: animating box-shadow on the node would erase its ring. */}
      {stage.status === "current" && <span className="absolute inset-0 animate-halo rounded-full" />}
      {stage.status === "completed" ? <Check size={20} strokeWidth={2.6} /> : <Icon size={19} strokeWidth={2} />}
    </span>
  );
}

export function JourneyStepper({ stages, variant = "compact", selected = null, onSelect }: JourneyStepperProps) {
  const detailed = variant === "detailed";
  const interactive = Boolean(onSelect);

  const renderLabel = (stage: OnboardingStageProgress, align: "center" | "left") => {
    const status = statusText(stage);
    return (
      <>
        <span className={`block text-[13.5px] font-semibold ${stage.status === "upcoming" ? "text-slate-600" : "text-navy-900"}`}>{stage.name}</span>
        <span className={`mt-0.5 block text-xs font-medium ${status.className}`}>{status.label}</span>
        {detailed && (
          <span className={`mt-1.5 block text-xs leading-relaxed text-slate-500 ${align === "center" ? "mx-auto max-w-[190px]" : ""}`}>{stageMeta[stage.name].description}</span>
        )}
      </>
    );
  };

  const wrap = (stage: OnboardingStageProgress, className: string, children: ReactNode) => {
    if (!interactive) return <div className={className}>{children}</div>;
    const isSelected = selected === stage.name;
    return (
      <button
        type="button"
        onClick={() => onSelect?.(isSelected ? null : stage.name)}
        aria-pressed={isSelected}
        className={`focus-ring rounded-panel transition-colors ${isSelected ? "bg-primary-50 ring-1 ring-primary-200" : "hover:bg-surface"} ${className}`}
      >
        {children}
      </button>
    );
  };

  return (
    <>
      {/* Horizontal stepper (tablet and up) */}
      <ol className="hidden grid-cols-5 md:grid">
        {stages.map((stage, index) => (
          <li key={stage.name} className="relative">
            {index < stages.length - 1 && (
              <span className={`absolute left-[calc(50%+30px)] right-[calc(-50%+30px)] h-[3px] overflow-hidden rounded-full bg-slate-100 ${detailed ? "top-[34px]" : "top-[30px]"}`} aria-hidden="true">
                <span
                  className={`block h-full origin-left animate-grow-x rounded-full ${stage.status === "upcoming" ? "bg-primary-200" : "bg-primary-500"}`}
                  style={{ width: `${connectorFill(stage)}%`, animationDelay: `${index * 120}ms` }}
                />
              </span>
            )}
            {wrap(
              stage,
              "flex w-full flex-col items-center px-2 py-2 text-center",
              <>
                <StageNode stage={stage} size={detailed ? "lg" : "md"} />
                <span className="mt-3 block">{renderLabel(stage, "center")}</span>
                {detailed && (
                  <span className="mt-3 flex w-full max-w-[150px] items-center gap-2" aria-hidden="true">
                    <span className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <span
                        className={`block h-full rounded-full ${stage.status === "completed" ? "bg-emerald-500" : "bg-primary-500"}`}
                        style={{ width: `${percentage(stage.completedTasks, stage.totalTasks)}%` }}
                      />
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500 tabular-nums">{percentage(stage.completedTasks, stage.totalTasks)}%</span>
                  </span>
                )}
              </>,
            )}
          </li>
        ))}
      </ol>

      {/* Vertical stepper (mobile) */}
      <ol className="md:hidden">
        {stages.map((stage, index) => (
          <li key={stage.name} className="relative pb-2 last:pb-0">
            {index < stages.length - 1 && (
              <span className="absolute bottom-0 left-[29px] top-[52px] w-[3px] overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                <span
                  className={`block w-full rounded-full ${stage.status === "upcoming" ? "bg-primary-200" : "bg-primary-500"}`}
                  style={{ height: `${connectorFill(stage)}%` }}
                />
              </span>
            )}
            {wrap(
              stage,
              "flex w-full items-start gap-4 p-2 text-left",
              <>
                <StageNode stage={stage} size="md" />
                <span className="min-w-0 pt-1">{renderLabel(stage, "left")}</span>
              </>,
            )}
          </li>
        ))}
      </ol>
    </>
  );
}
