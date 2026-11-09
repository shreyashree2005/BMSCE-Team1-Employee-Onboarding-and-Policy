import { type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, CornerDownLeft } from "lucide-react";

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled: boolean;
  placeholder?: string;
}

export function ChatComposer({ value, onChange, onSend, disabled, placeholder = "Ask about leave, benefits, payroll, onboarding…" }: ChatComposerProps) {
  const canSend = !disabled && value.trim().length > 0;

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (canSend) onSend();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSend) onSend();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="border-t border-line bg-white px-4 pb-3 pt-3 sm:px-6">
      <div className="rounded-2xl border border-line-strong bg-white shadow-[0_1px_2px_rgb(20_43_74/0.04)] transition-[border-color,box-shadow] focus-within:border-primary-400 focus-within:ring-4 focus-within:ring-primary-100/70">
        <label htmlFor="policy-question" className="sr-only">
          Ask a policy question
        </label>
        <textarea
          id="policy-question"
          rows={2}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          maxLength={500}
          className="block max-h-36 min-h-[56px] w-full resize-none bg-transparent px-4 pt-3 text-[13.5px] text-navy-900 placeholder:text-slate-400 focus:outline-none"
        />
        <div className="flex items-center justify-between px-3 pb-2.5">
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
            <CornerDownLeft size={11} aria-hidden="true" />
            Enter to send · Shift + Enter for a new line
          </span>
          <button
            type="submit"
            disabled={!canSend}
            className="focus-ring flex h-9 w-9 items-center justify-center rounded-full bg-primary-600 text-white shadow-[0_6px_14px_-8px_rgb(31_90_214/0.8)] transition-[background-color,transform] hover:bg-primary-700 active:scale-95 disabled:bg-slate-100 disabled:text-slate-300 disabled:shadow-none"
            aria-label="Send question"
          >
            <ArrowUp size={16} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-400">
        Answers are AI-generated only from uploaded company policies and can be incomplete. Check the cited source, and contact HR for decisions about your situation.
      </p>
    </form>
  );
}
