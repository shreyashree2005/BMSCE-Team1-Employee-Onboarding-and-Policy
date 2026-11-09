import { useEffect, useState, type FormEvent } from "react";
import { Lock } from "lucide-react";
import type { FormFieldDef } from "../../../types/taskActions";
import { Button } from "../../ui/Button";
import type { ActionControls } from "./TaskActionPanel";

const inputClass =
  "focus-ring w-full rounded-lg border border-line-strong bg-white px-3 py-2 text-[13px] text-navy-900 placeholder:text-slate-400 focus:border-primary-400 focus:outline-none aria-[invalid=true]:border-rose-300 disabled:bg-surface disabled:text-slate-500";

const SENSITIVE = new Set(["account_number", "confirm_account_number"]);

function clientError(field: FormFieldDef, value: string | boolean | undefined): string | null {
  if (field.fixedValue !== null) return null;
  if (field.type === "checkbox") return field.required && value !== true ? "Please confirm." : null;
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return field.required ? `${field.label} is required.` : null;
  if (text.length < field.minLength) return `Use at least ${field.minLength} characters.`;
  if (field.pattern && !new RegExp(field.pattern).test(text)) return field.patternMessage ?? "Invalid format.";
  return null;
}

/** A form generated from the server's field definitions; the server validates again on submit. */
export function FormAction({ state, busy, fieldErrors, submit }: ActionControls) {
  const [values, setValues] = useState<Record<string, string | boolean>>(state.values);
  const [touched, setTouched] = useState(false);

  useEffect(() => setValues(state.values), [state.values]);

  const localErrors = Object.fromEntries(state.fields.map((f) => [f.name, clientError(f, values[f.name])]).filter(([, e]) => e)) as Record<string, string>;
  if (state.kind === "bank_details" && values.account_number && values.account_number !== values.confirm_account_number && !localErrors.confirm_account_number) {
    localErrors.confirm_account_number = "Account numbers don't match.";
  }
  const errorFor = (name: string) => fieldErrors[name] ?? (touched ? localErrors[name] : undefined);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (Object.keys(localErrors).length > 0) return;
    const payload = Object.fromEntries(state.fields.filter((f) => f.fixedValue === null).map((f) => [f.name, values[f.name] ?? (f.type === "checkbox" ? false : "")]));
    const ok = await submit({ values: payload });
    if (ok) setTouched(false);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-3">
      {state.fields.map((field) => {
        const id = `field-${field.name}`;
        const error = errorFor(field.name);
        const value = field.fixedValue ?? values[field.name] ?? "";
        const describedBy = [error ? `${id}-error` : null, field.help ? `${id}-help` : null].filter(Boolean).join(" ") || undefined;
        const common = {
          id,
          disabled: busy || field.fixedValue !== null,
          "aria-invalid": Boolean(error),
          "aria-describedby": describedBy,
          required: field.required,
        };
        const set = (next: string | boolean) => setValues((prev) => ({ ...prev, [field.name]: next }));

        if (field.type === "checkbox") {
          return (
            <div key={field.name}>
              <label className="flex items-start gap-2.5 text-[13px] text-navy-900">
                <input {...common} type="checkbox" checked={value === true} onChange={(e) => set(e.target.checked)} className="focus-ring mt-0.5 h-4 w-4 rounded border-line-strong accent-primary-500" />
                {field.label}
              </label>
              {error && <p id={`${id}-error`} className="mt-1 text-[12px] text-rose-600">{error}</p>}
            </div>
          );
        }
        return (
          <div key={field.name}>
            <label htmlFor={id} className="mb-1 flex items-center gap-1.5 text-[12.5px] font-medium text-navy-900">
              {field.label}
              {!field.required && <span className="font-normal text-slate-400">(optional)</span>}
              {SENSITIVE.has(field.name) && <Lock size={11} className="text-slate-400" aria-label="Encrypted" />}
            </label>
            {field.type === "textarea" ? (
              <textarea {...common} rows={3} maxLength={field.maxLength} value={String(value)} onChange={(e) => set(e.target.value)} className={inputClass} />
            ) : field.type === "select" ? (
              <select {...common} value={String(value)} onChange={(e) => set(e.target.value)} className={`${inputClass} h-9`}>
                <option value="">Choose…</option>
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                {...common}
                type={SENSITIVE.has(field.name) ? "password" : field.type === "number" ? "text" : field.type}
                inputMode={field.type === "number" || SENSITIVE.has(field.name) ? "numeric" : undefined}
                autoComplete={SENSITIVE.has(field.name) ? "off" : undefined}
                maxLength={field.maxLength}
                value={String(value)}
                placeholder={SENSITIVE.has(field.name) && state.maskedValues.account_number ? `Saved ${state.maskedValues.account_number} · enter again to change` : undefined}
                onChange={(e) => set(e.target.value)}
                className={`${inputClass} h-9`}
              />
            )}
            {field.help && <p id={`${id}-help`} className="mt-1 text-[11.5px] text-slate-500">{field.help}</p>}
            {error && <p id={`${id}-error`} className="mt-1 text-[12px] text-rose-600">{error}</p>}
          </div>
        );
      })}
      <Button type="submit" disabled={busy} className="w-full sm:w-auto">
        {state.completed ? "Save changes" : "Submit"}
      </Button>
    </form>
  );
}
