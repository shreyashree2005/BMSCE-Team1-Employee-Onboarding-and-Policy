import { STAGE_ORDER } from "../../config/stages";
import type { OnboardingStageName } from "../../types/dashboard";

interface StageSegmentsProps {
  currentStage: OnboardingStageName | "Completed";
  size?: "sm" | "md";
}

/** Five-segment bar showing how far along the onboarding journey someone is. */
export function StageSegments({ currentStage, size = "sm" }: StageSegmentsProps) {
  const done = currentStage === "Completed";
  const currentIndex = done ? STAGE_ORDER.length : STAGE_ORDER.indexOf(currentStage);
  const label = done ? "All stages completed" : `Stage ${currentIndex + 1} of ${STAGE_ORDER.length}: ${currentStage}`;

  return (
    <span className="flex items-center gap-1" role="img" aria-label={label} title={label}>
      {STAGE_ORDER.map((stage, index) => {
        const tone = done ? "bg-emerald-500" : index < currentIndex ? "bg-primary-500" : index === currentIndex ? "bg-primary-300" : "bg-slate-200";
        return <span key={stage} className={`${size === "md" ? "h-2 w-full" : "h-1.5 w-5"} rounded-full ${tone}`} />;
      })}
    </span>
  );
}
