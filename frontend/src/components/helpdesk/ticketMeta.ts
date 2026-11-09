import type { TicketCategory, TicketStatus } from "../../types/helpdesk";
import type { StatusTone } from "../ui/StatusPill";

/** Mirrors TICKET_CATEGORY_LABELS in backend/app/schemas/helpdesk.py (the API validates the value). */
export const TICKET_CATEGORIES: { value: TicketCategory; label: string }[] = [
  { value: "it_support", label: "IT Support" },
  { value: "hr_support", label: "HR Support" },
  { value: "payroll", label: "Payroll Issues" },
  { value: "benefits", label: "Benefits Queries" },
  { value: "document_upload", label: "Document Upload Issues" },
  { value: "onboarding_task", label: "Onboarding Task Issues" },
  { value: "account_login", label: "Account/Login Issues" },
  { value: "other", label: "Other" },
];

export const TICKET_STATUSES: { value: TicketStatus; label: string; tone: StatusTone }[] = [
  { value: "open", label: "Open", tone: "blue" },
  { value: "in_progress", label: "In Progress", tone: "amber" },
  { value: "resolved", label: "Resolved", tone: "green" },
  { value: "closed", label: "Closed", tone: "neutral" },
];

export const statusMeta = (status: TicketStatus) => TICKET_STATUSES.find((s) => s.value === status) ?? TICKET_STATUSES[0];

export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

export function attachmentError(file: File): string | null {
  if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) return "Attach a screenshot (PNG or JPG) or a PDF.";
  if (file.size === 0) return "The file is empty.";
  if (file.size > ATTACHMENT_MAX_BYTES) return "Attachments can be at most 5 MB.";
  return null;
}

export function ticketFormErrors(values: { category: string; subject: string; description: string }): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!values.category) errors.category = "Choose a category.";
  const subject = values.subject.trim().replace(/\s+/g, " ");
  if (subject.length < 5 || subject.length > 150) errors.subject = "Enter a subject of 5–150 characters.";
  const description = values.description.trim();
  if (description.length < 10 || description.length > 4000) errors.description = "Describe the issue in 10–4000 characters.";
  return errors;
}
