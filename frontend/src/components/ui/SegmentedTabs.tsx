export interface SegmentedTabOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface SegmentedTabsProps<T extends string> {
  options: SegmentedTabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  /** "underline" sits on a panel's header divider; "pill" is a compact standalone control. */
  variant?: "underline" | "pill";
}

/** Filter tabs. Selecting a tab calls `onChange`; the parent owns the filter state. */
export function SegmentedTabs<T extends string>({ options, value, onChange, label, variant = "pill" }: SegmentedTabsProps<T>) {
  const underline = variant === "underline";
  return (
    <div
      role="tablist"
      aria-label={label}
      className={underline ? "-mb-px flex max-w-full gap-5 overflow-x-auto" : "inline-flex max-w-full overflow-x-auto rounded-lg bg-surface p-1 ring-1 ring-inset ring-line"}
    >
      {options.map((option) => {
        const selected = option.value === value;
        const stateClasses = underline
          ? selected
            ? "border-primary-500 text-navy-900"
            : "border-transparent text-slate-500 hover:text-navy-900"
          : selected
            ? "bg-white text-navy-900 shadow-[0_1px_2px_rgb(20_43_74/0.08)] ring-1 ring-line"
            : "text-slate-500 hover:text-navy-900";
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={`focus-ring flex shrink-0 items-center gap-1.5 text-[13px] font-semibold transition-colors ${
              underline ? "border-b-2 pb-3 pt-1" : "rounded-md px-3 py-1.5"
            } ${stateClasses}`}
          >
            {option.label}
            {option.count !== undefined && (
              <span
                className={`min-w-5 rounded-full px-1.5 py-px text-center text-[11px] tabular-nums ${
                  selected ? "bg-primary-500 text-white" : "bg-slate-100 text-slate-500"
                }`}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
