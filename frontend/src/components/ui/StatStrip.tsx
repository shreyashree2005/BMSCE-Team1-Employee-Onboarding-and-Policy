import type { ReactNode } from "react";

export interface StatStripItem {
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  /** Optional visual (ring, bar, dots…) rendered beside or below the value. */
  visual?: ReactNode;
}

// Hairline dividers for a 1 → 2 → 4 column grid.
const segmentBorders = [
  "",
  "border-t sm:border-t-0 sm:border-l",
  "border-t xl:border-t-0 xl:border-l",
  "border-t sm:border-l xl:border-t-0",
];

/**
 * A single panel split into metric segments by hairline dividers, instead of a
 * row of identical cards. Each segment can carry its own small visual.
 */
export function StatStrip({ items, label }: { items: StatStripItem[]; label: string }) {
  return (
    <section aria-label={label} className="overflow-hidden rounded-panel border border-line bg-white shadow-card">
      <dl className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item, index) => (
          <div key={item.label} className={`flex flex-col justify-between gap-3 border-line px-5 py-5 sm:px-6 ${segmentBorders[index] ?? ""}`}>
            <dt className="eyebrow text-slate-500">{item.label}</dt>
            <dd className="flex items-end justify-between gap-4">
              <span className="min-w-0">
                <span className="block text-[28px] font-semibold leading-none tracking-[-0.02em] text-navy-900 tabular-nums">{item.value}</span>
                {item.caption && <span className="mt-2 block text-xs text-slate-500">{item.caption}</span>}
              </span>
              {item.visual}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
