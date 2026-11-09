import type { ReactNode } from "react";

interface CardProps {
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  action?: ReactNode;
  className?: string;
  /** Use "none" when the content manages its own padding (tables, lists with dividers). */
  padding?: "md" | "none";
  children: ReactNode;
}

export function Card({ title, subtitle, eyebrow, action, className = "", padding = "md", children }: CardProps) {
  const hasHeader = Boolean(title || action || eyebrow);
  return (
    <section className={`rounded-panel border border-line bg-white shadow-card ${padding === "md" ? "p-5 sm:p-6" : ""} ${className}`}>
      {hasHeader && (
        <header className={`flex items-start justify-between gap-3 ${padding === "md" ? "mb-5" : "border-b border-primary-100 bg-gradient-to-r from-primary-50/70 to-white px-5 py-4 sm:px-6"}`}>
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow mb-1 text-primary-600">{eyebrow}</p>}
            {title && <h2 className="text-[15px] font-semibold tracking-tight text-primary-700">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[13px] text-slate-500">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
