import { useCallback, useRef, useState, type ReactNode } from "react";
import { useClickOutside } from "../../hooks/useClickOutside";

type Placement = "bottom-end" | "top-start";

const placementClasses: Record<Placement, string> = {
  "bottom-end": "right-0 top-full mt-2 origin-top-right",
  "top-start": "bottom-full left-0 mb-2 origin-bottom-left",
};

interface DropdownProps {
  /** Content of the trigger button. */
  trigger: ReactNode;
  triggerLabel: string;
  triggerClassName?: string;
  panelClassName?: string;
  placement?: Placement;
  /** Receives a `close` callback so menu items can dismiss the panel. */
  children: (close: () => void) => ReactNode;
}

export function Dropdown({ trigger, triggerLabel, triggerClassName = "", panelClassName = "w-72", placement = "bottom-end", children }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(containerRef, close, open);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`focus-ring ${triggerClassName}`}
        aria-label={triggerLabel}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {trigger}
      </button>
      {open && (
        <div
          className={`absolute z-40 max-w-[calc(100vw-2rem)] animate-scale-in overflow-hidden rounded-panel border border-line bg-white shadow-pop ${placementClasses[placement]} ${panelClassName}`}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}
