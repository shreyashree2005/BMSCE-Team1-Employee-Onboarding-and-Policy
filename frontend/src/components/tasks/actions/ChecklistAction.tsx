import { Check } from "lucide-react";
import { Button } from "../../ui/Button";
import type { ActionControls } from "./TaskActionPanel";

/** Steps to tick off; each tick is saved, and the task completes once every step is done. */
export function ChecklistAction({ state, busy, submit }: ActionControls) {
  const checked = state.items.filter((i) => i.checked).map((i) => i.id);
  const allDone = checked.length === state.items.length;

  const toggle = (id: string) => {
    const next = checked.includes(id) ? checked.filter((c) => c !== id) : [...checked, id];
    void submit({ checkedItems: next });
  };

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line rounded-lg border border-line">
        {state.items.map((item) => (
          <li key={item.id}>
            <label className={`flex cursor-pointer items-start gap-3 px-3 py-2.5 ${busy ? "cursor-wait" : "hover:bg-surface"}`}>
              <input
                type="checkbox"
                checked={item.checked}
                disabled={busy || state.completed}
                onChange={() => toggle(item.id)}
                className="focus-ring mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong accent-primary-500"
              />
              <span className="min-w-0">
                <span className={`block text-[13px] ${item.checked ? "text-slate-500 line-through decoration-slate-300" : "text-navy-900"}`}>{item.label}</span>
                {item.help && <span className="mt-0.5 block text-[11.5px] text-slate-500">{item.help}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-slate-500" aria-live="polite">
          {checked.length} of {state.items.length} steps done
        </span>
        {!state.completed && (
          <Button size="sm" disabled={busy || !allDone} onClick={() => void submit({ checkedItems: checked, complete: true })}>
            <Check size={14} aria-hidden="true" />
            Complete task
          </Button>
        )}
      </div>
    </div>
  );
}
