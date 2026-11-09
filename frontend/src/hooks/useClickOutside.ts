import { useEffect, type RefObject } from "react";

/** Calls `onOutsideClick` when a pointer press or Escape key happens outside `ref`. */
export function useClickOutside(ref: RefObject<HTMLElement | null>, onOutsideClick: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const handlePointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onOutsideClick();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOutsideClick();
    };

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [ref, onOutsideClick, enabled]);
}
