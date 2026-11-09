import { FlaskConical } from "lucide-react";

interface DemoBadgeProps {
  label?: string;
}

/** Marks content that uses fictional demo data or mock behaviour. */
export function DemoBadge({ label = "Demo data" }: DemoBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-dashed border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
      <FlaskConical size={12} aria-hidden="true" />
      {label}
    </span>
  );
}
