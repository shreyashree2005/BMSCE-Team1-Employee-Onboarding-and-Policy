import type { Ticket, TicketCategory, TicketStatus, TicketSummary } from "../types/helpdesk";
import { ApiError, apiBlob, apiRequest } from "./apiClient";

const BASE_PATH = "/api/v1/helpdesk";

function assertTicket(value: unknown): Ticket {
  if (!value || typeof value !== "object" || typeof (value as Ticket).id !== "number" || typeof (value as Ticket).reference !== "string") {
    throw new ApiError("The server returned an unexpected ticket format.", null);
  }
  return value as Ticket;
}

function assertTickets(value: unknown): Ticket[] {
  if (!Array.isArray(value)) throw new ApiError("The server returned an unexpected ticket list.", null);
  return value.map(assertTicket);
}

export interface NewTicket {
  category: TicketCategory;
  subject: string;
  description: string;
  attachment?: File | null;
}

/** Your own tickets, newest first. */
export async function fetchMyTickets(signal?: AbortSignal): Promise<Ticket[]> {
  return assertTickets(await apiRequest<unknown>(`${BASE_PATH}/tickets`, { signal }));
}

export async function createTicket(ticket: NewTicket): Promise<Ticket> {
  const form = new FormData();
  form.append("category", ticket.category);
  form.append("subject", ticket.subject);
  form.append("description", ticket.description);
  if (ticket.attachment) form.append("attachment", ticket.attachment);
  return assertTicket(await apiRequest<unknown>(`${BASE_PATH}/tickets`, { method: "POST", body: form }, { timeoutMs: 60_000 }));
}

export function fetchMyTicketAttachment(ticketId: number): Promise<Blob> {
  return apiBlob(`${BASE_PATH}/tickets/${ticketId}/attachment`);
}

// ---- HR ----

export async function fetchAllTickets(status?: TicketStatus, signal?: AbortSignal): Promise<Ticket[]> {
  const query = status ? `?status=${status}` : "";
  return assertTickets(await apiRequest<unknown>(`${BASE_PATH}/admin/tickets${query}`, { signal }));
}

export async function fetchTicketSummary(signal?: AbortSignal): Promise<TicketSummary> {
  return (await apiRequest<unknown>(`${BASE_PATH}/admin/summary`, { signal })) as TicketSummary;
}

export async function updateTicketStatus(ticketId: number, status: TicketStatus): Promise<Ticket> {
  return assertTicket(await apiRequest<unknown>(`${BASE_PATH}/admin/tickets/${ticketId}`, { method: "PATCH", body: JSON.stringify({ status }) }));
}

export function fetchAnyTicketAttachment(ticketId: number): Promise<Blob> {
  return apiBlob(`${BASE_PATH}/admin/tickets/${ticketId}/attachment`);
}
