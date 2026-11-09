import type { ReactNode } from "react";

interface SectionHeaderProps {
  id?: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  /** Small icon or illustration shown before the heading. */
  leading?: ReactNode;
}

/** The blue section heading used across the guided onboarding pages, so every section reads the same way. */
export function SectionHeader({ id, title, description, action, leading }: SectionHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {leading}
        <div className="min-w-0">
          <h2 id={id} className="flex items-center gap-2 text-[17px] font-semibold tracking-tight text-primary-700">
            {!leading && <span className="h-4 w-1 shrink-0 rounded-full bg-gradient-to-b from-primary-400 to-primary-600" aria-hidden="true" />}
            {title}
          </h2>
          {description && <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
