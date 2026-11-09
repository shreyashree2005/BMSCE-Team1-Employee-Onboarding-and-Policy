import { LayoutGrid } from "lucide-react";
import { taskCategoryIcons } from "../../config/taskMeta";
import type { TaskCategory } from "../../types/dashboard";

interface CategoryFilterProps {
  categories: { category: TaskCategory; count: number }[];
  total: number;
  selected: TaskCategory | null;
  onSelect: (category: TaskCategory | null) => void;
}

const chip = "focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors";

/** Category chips for the checklist; counts reflect the other active filters. */
export function CategoryFilter({ categories, total, selected, onSelect }: CategoryFilterProps) {
  const options: { value: TaskCategory | null; label: string; count: number }[] = [
    { value: null, label: "All categories", count: total },
    ...categories.map((c) => ({ value: c.category, label: c.category, count: c.count })),
  ];

  return (
    <div role="group" aria-label="Filter checklist by category" className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {options.map(({ value, label, count }) => {
        const isSelected = selected === value;
        const Icon = value ? taskCategoryIcons[value] : LayoutGrid;
        return (
          <button
            key={label}
            type="button"
            onClick={() => onSelect(isSelected && value ? null : value)}
            aria-pressed={isSelected}
            disabled={count === 0 && !isSelected}
            className={`${chip} ${
              isSelected ? "border-primary-600 bg-primary-600 text-white shadow-glow" : "border-line bg-white text-slate-600 hover:border-primary-200 hover:text-navy-900 disabled:opacity-40"
            }`}
          >
            <Icon size={13} className={isSelected ? "text-primary-200" : "text-slate-400"} aria-hidden="true" />
            {label}
            <span className={`tabular-nums ${isSelected ? "text-white/70" : "text-slate-400"}`}>{count}</span>
          </button>
        );
      })}
    </div>
  );
}
