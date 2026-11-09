import { useRef, useState, type FormEvent } from "react";
import { LoaderCircle, Paperclip, Send, X } from "lucide-react";
import { ApiError } from "../../services/apiClient";
import { createTicket } from "../../services/helpdeskApi";
import type { Ticket, TicketCategory } from "../../types/helpdesk";
import { formatBytes } from "../../utils/format";
import { Button } from "../ui/Button";
import { fieldControlClass, fieldLabelClass } from "../ui/formStyles";
import { TICKET_CATEGORIES, attachmentError, ticketFormErrors } from "./ticketMeta";

const inputClass = fieldControlClass;

/** Raise a support ticket: category, subject, description and an optional screenshot or PDF. */
export function TicketForm({ onCreated }: { onCreated: (ticket: Ticket) => void }) {
  const [category, setCategory] = useState<TicketCategory | "">("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const chooseFile = (file: File | undefined) => {
    if (fileInput.current) fileInput.current.value = "";
    if (!file) return;
    const problem = attachmentError(file);
    setErrors((prev) => ({ ...prev, attachment: problem ?? "" }));
    setAttachment(problem ? null : file);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found = ticketFormErrors({ category, subject, description });
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0 || !category) return;
    setSubmitting(true);
    try {
      const ticket = await createTicket({ category, subject, description, attachment });
      onCreated(ticket);
      setCategory("");
      setSubject("");
      setDescription("");
      setAttachment(null);
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      setFormError(apiError?.message ?? "Your ticket couldn't be submitted. Please try again.");
      setErrors(apiError?.fields ?? {});
    } finally {
      setSubmitting(false);
    }
  };

  const fieldError = (name: string) =>
    errors[name] ? (
      <p id={`ticket-${name}-error`} className="mt-1 text-[12px] text-rose-600">
        {errors[name]}
      </p>
    ) : null;

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="Raise a support ticket">
      <div>
        <label htmlFor="ticket-category" className={fieldLabelClass}>
          Category
        </label>
        <select
          id="ticket-category"
          value={category}
          onChange={(e) => setCategory(e.target.value as TicketCategory)}
          aria-invalid={Boolean(errors.category)}
          aria-describedby={errors.category ? "ticket-category-error" : undefined}
          className={`${inputClass} h-10`}
        >
          <option value="">Choose a category…</option>
          {TICKET_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        {fieldError("category")}
      </div>
      <div>
        <label htmlFor="ticket-subject" className={fieldLabelClass}>
          Subject
        </label>
        <input
          id="ticket-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={150}
          placeholder="e.g. Can't upload my address proof"
          aria-invalid={Boolean(errors.subject)}
          aria-describedby={errors.subject ? "ticket-subject-error" : undefined}
          className={`${inputClass} h-10`}
        />
        {fieldError("subject")}
      </div>
      <div>
        <label htmlFor="ticket-description" className={fieldLabelClass}>
          Description
        </label>
        <textarea
          id="ticket-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          maxLength={4000}
          placeholder="What happened, what you expected, and any error message you saw."
          aria-invalid={Boolean(errors.description)}
          aria-describedby={errors.description ? "ticket-description-error" : undefined}
          className={`${inputClass} py-2.5`}
        />
        {fieldError("description")}
      </div>
      <div>
        <p className={fieldLabelClass}>
          Attachment <span className="font-normal text-slate-400">(optional)</span>
        </p>
        <input ref={fileInput} type="file" accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf" className="sr-only" aria-label="Attach a screenshot or document" onChange={(e) => chooseFile(e.target.files?.[0])} />
        {attachment ? (
          <p className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px] text-slate-700">
            <Paperclip size={14} className="text-slate-400" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">
              {attachment.name} · {formatBytes(attachment.size)}
            </span>
            <button type="button" onClick={() => setAttachment(null)} className="focus-ring rounded p-1 text-slate-400 hover:text-navy-900" aria-label="Remove attachment">
              <X size={14} aria-hidden="true" />
            </button>
          </p>
        ) : (
          <Button type="button" size="sm" variant="secondary" onClick={() => fileInput.current?.click()}>
            <Paperclip size={14} aria-hidden="true" />
            Attach screenshot or PDF
          </Button>
        )}
        <p className="mt-1 text-[11.5px] text-slate-500">PNG, JPG or PDF, up to 5 MB.</p>
        {fieldError("attachment")}
      </div>
      {formError && (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
          {formError}
        </p>
      )}
      <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
        {submitting ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
        Submit ticket
      </Button>
    </form>
  );
}
