import type { TicketStatus } from "../../types/helpdesk";
import { StatusPill } from "../ui/StatusPill";
import { statusMeta } from "./ticketMeta";

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const meta = statusMeta(status);
  return <StatusPill tone={meta.tone}>{meta.label}</StatusPill>;
}
