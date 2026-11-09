import { X } from "lucide-react";

interface FilterChipProps {
  label: string;
  onRemove: () => void;
}

/** Shows an active filter with a button to clear it. */
export function FilterChip({ label, onRemove }: FilterChipProps) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-primary-200 bg-primary-50 py-0.5 pl-2 pr-1 text-xs font-medium text-primary-700">
      {label}
      <button type="button" onClick={onRemove} className="focus-ring rounded p-0.5 hover:bg-primary-100" aria-label={`Remove filter: ${label}`}>
        <X size={12} aria-hidden="true" />
      </button>
    </span>
  );
}
