import type { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description: string;
  badge?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, badge, actions }: PageHeaderProps) {
  return (
    <div className="relative flex flex-col gap-4 overflow-hidden rounded-panel border border-primary-100 bg-gradient-to-br from-primary-100/80 via-primary-50 to-white px-5 py-5 shadow-card sm:flex-row sm:items-end sm:justify-between sm:px-7 sm:py-6">
      <span className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-white/60 blur-2xl" aria-hidden="true" />
      <div className="relative min-w-0">
        {eyebrow && <p className="eyebrow mb-1.5 text-primary-600">{eyebrow}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em] text-primary-800">{title}</h1>
          {badge}
        </div>
        <p className="mt-1.5 max-w-2xl text-sm text-slate-600">{description}</p>
      </div>
      {actions && <div className="relative flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
