/** Help Desk tickets. Mirrors backend/app/schemas/helpdesk.py. */
export type TicketCategory = "it_support" | "hr_support" | "payroll" | "benefits" | "document_upload" | "onboarding_task" | "account_login" | "other";
export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";

export interface Ticket {
  id: number;
  reference: string;
  category: TicketCategory;
  categoryLabel: string;
  subject: string;
  description: string;
  status: TicketStatus;
  attachment: { filename: string; contentType: string; sizeBytes: number } | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  requesterName: string | null;
  requesterEmail: string | null;
}

export interface TicketSummary {
  total: number;
  byStatus: Record<TicketStatus, number>;
}
