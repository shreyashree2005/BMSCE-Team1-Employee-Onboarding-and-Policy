import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarClock, Compass, Inbox, Paperclip, SearchX, Tag, UserRound } from "lucide-react";
import { TicketForm } from "../components/helpdesk/TicketForm";
import { TicketStatusBadge } from "../components/helpdesk/TicketStatusBadge";
import { TICKET_STATUSES } from "../components/helpdesk/ticketMeta";
import { SectionIllustration } from "../components/illustrations/SectionIllustration";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { PageHeader } from "../components/ui/PageHeader";
import { SearchInput } from "../components/ui/SearchInput";
import { SectionHeader } from "../components/ui/SectionHeader";
import { SegmentedTabs } from "../components/ui/SegmentedTabs";
import { Skeleton } from "../components/ui/Skeleton";
import { useCurrentUser } from "../context/AuthContext";
import { useGuidance } from "../context/GuidanceContext";
import { useToast } from "../context/ToastContext";
import { ApiError } from "../services/apiClient";
import { fetchAllTickets, fetchAnyTicketAttachment, fetchMyTicketAttachment, fetchMyTickets, fetchTicketSummary, updateTicketStatus } from "../services/helpdeskApi";
import type { Ticket, TicketStatus, TicketSummary } from "../types/helpdesk";
import { formatDate, formatTime } from "../utils/format";

type Filter = "all" | TicketStatus;

function useTickets(load: (signal: AbortSignal) => Promise<Ticket[]>, key: string) {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    load(controller.signal)
      .then(setTickets)
      .catch((caught: unknown) => !controller.signal.aborted && setError(caught instanceof ApiError ? caught.message : "Tickets couldn't be loaded."));
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when the key changes
  }, [key, reload]);
  return { tickets, setTickets, error, retry: () => setReload((n) => n + 1) };
}

/** Matches a search term against the ticket's reference, subject, category, description and requester. */
function matchesSearch(ticket: Ticket, term: string): boolean {
  if (!term) return true;
  return [ticket.reference, ticket.subject, ticket.categoryLabel, ticket.description, ticket.requesterName ?? "", ticket.requesterEmail ?? ""].some((field) =>
    field.toLowerCase().includes(term),
  );
}

const LONG_DESCRIPTION = 240;

function TicketCard({ ticket, onAttachment, children }: { ticket: Ticket; onAttachment: (ticket: Ticket) => void; children?: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const long = ticket.description.length > LONG_DESCRIPTION;
  return (
    <li className="animate-fade-in px-5 py-4 transition-colors hover:bg-primary-50/30 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-200">{ticket.reference}</span>
        <span className="inline-flex items-center gap-1 rounded-md bg-primary-50/70 px-1.5 py-0.5 text-[11px] font-medium text-primary-700">
          <Tag size={11} aria-hidden="true" />
          {ticket.categoryLabel}
        </span>
        <span className="ml-auto">
          <TicketStatusBadge status={ticket.status} />
        </span>
      </div>
      <p className="mt-2 text-[14px] font-semibold leading-snug text-navy-900">{ticket.subject}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <CalendarClock size={12} aria-hidden="true" />
          Raised {formatDate(ticket.createdAt)} at {formatTime(ticket.createdAt)}
        </span>
        {ticket.requesterName && (
          <span className="inline-flex items-center gap-1">
            <UserRound size={12} aria-hidden="true" />
            {ticket.requesterName} ({ticket.requesterEmail})
          </span>
        )}
        {ticket.resolvedAt && <span className="text-emerald-700">Resolved {formatDate(ticket.resolvedAt)}</span>}
      </p>
      <p className={`mt-2 whitespace-pre-line text-[13px] leading-relaxed text-slate-600 ${long && !expanded ? "line-clamp-3" : ""}`}>{ticket.description}</p>
      {(long || ticket.attachment || children) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-3">
          {long && (
            <button type="button" onClick={() => setExpanded((prev) => !prev)} aria-expanded={expanded} className="focus-ring rounded text-xs font-semibold text-primary-600 hover:underline">
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
          {ticket.attachment && (
            <button type="button" onClick={() => onAttachment(ticket)} className="focus-ring inline-flex items-center gap-1 rounded text-xs font-semibold text-primary-600 hover:underline">
              <Paperclip size={12} aria-hidden="true" />
              {ticket.attachment.filename}
            </button>
          )}
          {children}
        </div>
      )}
    </li>
  );
}

function useOpenAttachment(fetcher: (id: number) => Promise<Blob>) {
  const { showToast } = useToast();
  return useCallback(
    async (ticket: Ticket) => {
      try {
        const url = URL.createObjectURL(await fetcher(ticket.id));
        window.open(url, "_blank", "noopener,noreferrer");
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } catch (caught) {
        showToast(caught instanceof ApiError ? caught.message : "The attachment couldn't be opened.", "error");
      }
    },
    [fetcher, showToast],
  );
}

const statusTint: Record<TicketStatus, string> = {
  open: "text-primary-700",
  in_progress: "text-amber-700",
  resolved: "text-emerald-700",
  closed: "text-slate-600",
};

/** Ticket counts per status as small cards. Selecting one filters the list to that status. */
function StatusSummary({ counts, total, selected, onSelect, label }: { counts: Record<TicketStatus, number>; total: number; selected: Filter; onSelect: (filter: Filter) => void; label: string }) {
  const cards: { value: Filter; label: string; count: number; tint: string }[] = [
    { value: "all", label: "All tickets", count: total, tint: "text-navy-900" },
    ...TICKET_STATUSES.map((s) => ({ value: s.value, label: s.label, count: counts[s.value] ?? 0, tint: statusTint[s.value] })),
  ];
  return (
    <div role="group" aria-label={label} className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => {
        const active = card.value === selected;
        return (
          <button
            key={card.value}
            type="button"
            onClick={() => onSelect(card.value)}
            aria-pressed={active}
            aria-label={`${card.label}: ${card.count}`}
            className={`focus-ring rounded-panel border bg-white px-4 py-3 text-left shadow-card transition-[border-color,box-shadow] hover:border-primary-200 ${
              active ? "border-primary-400 ring-2 ring-primary-100" : "border-line"
            }`}
          >
            <span className="block text-[11.5px] font-medium text-slate-500">{card.label}</span>
            <span className={`mt-1 block text-[24px] font-semibold leading-none tabular-nums ${card.tint}`}>{card.count}</span>
          </button>
        );
      })}
    </div>
  );
}

function TicketListBody({
  tickets,
  visible,
  error,
  retry,
  label,
  emptyTitle,
  emptyMessage,
  onClear,
  renderTicket,
}: {
  tickets: Ticket[] | null;
  visible: Ticket[];
  error: string | null;
  retry: () => void;
  label: string;
  emptyTitle: string;
  emptyMessage: string;
  onClear: () => void;
  renderTicket: (ticket: Ticket) => ReactNode;
}) {
  if (error) return <ErrorState title="Couldn't load tickets" message={error} onRetry={retry} />;
  if (!tickets)
    return (
      <div className="space-y-4 p-6" aria-label="Loading tickets">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
    );
  if (tickets.length === 0) return <EmptyState icon={Inbox} title={emptyTitle} message={emptyMessage} />;
  if (visible.length === 0)
    return (
      <EmptyState
        icon={SearchX}
        title="No matching tickets"
        message="Try a different search or status."
        action={
          <Button variant="secondary" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        }
      />
    );
  return (
    <ul className="divide-y divide-line" aria-label={label}>
      {visible.map(renderTicket)}
    </ul>
  );
}

function countByStatus(tickets: Ticket[] | null): Record<TicketStatus, number> {
  const counts: Record<TicketStatus, number> = { open: 0, in_progress: 0, resolved: 0, closed: 0 };
  for (const ticket of tickets ?? []) counts[ticket.status] += 1;
  return counts;
}

function EmployeeHelpDesk() {
  const { showToast } = useToast();
  const { startTour } = useGuidance();
  const { tickets, setTickets, error, retry } = useTickets(fetchMyTickets, "mine");
  const openAttachment = useOpenAttachment(fetchMyTicketAttachment);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();
  const counts = useMemo(() => countByStatus(tickets), [tickets]);
  const visible = (tickets ?? []).filter((t) => (filter === "all" || t.status === filter) && matchesSearch(t, term));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Help Desk"
        description="Raise a request whenever you need help, and track it here."
        actions={
          <Button variant="secondary" size="sm" onClick={startTour}>
            <Compass size={14} aria-hidden="true" />
            Take the website tour
          </Button>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <section aria-labelledby="new-ticket-heading" className="rounded-panel border border-line bg-white p-5 shadow-card sm:p-6 lg:sticky lg:top-24">
          <SectionHeader id="new-ticket-heading" title="Raise a ticket" description="HR or IT will pick it up and update its status." leading={<SectionIllustration name="helpdesk" className="h-12 w-16 shrink-0" />} />
          <div className="mt-5">
            <TicketForm
              onCreated={(ticket) => {
                setTickets((prev) => [ticket, ...(prev ?? [])]);
                showToast(`Ticket ${ticket.reference} submitted. You can track its status here.`);
              }}
            />
          </div>
        </section>
        <section aria-labelledby="my-tickets-heading" className="rounded-panel border border-line bg-white shadow-card">
          <div className="space-y-3 border-b border-line px-5 pt-5 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <SectionHeader id="my-tickets-heading" title="My tickets" description="Open → In Progress → Resolved → Closed" />
              {tickets && tickets.length > 0 && <SearchInput value={query} onChange={setQuery} label="Search my tickets" placeholder="Search tickets…" className="sm:w-56" />}
            </div>
            <SegmentedTabs
              variant="underline"
              label="Filter my tickets by status"
              value={filter}
              onChange={setFilter}
              options={[{ value: "all", label: "All", count: tickets?.length ?? 0 }, ...TICKET_STATUSES.map((s) => ({ value: s.value, label: s.label, count: counts[s.value] }))]}
            />
          </div>
          <TicketListBody
            tickets={tickets}
            visible={visible}
            error={error}
            retry={retry}
            label="My tickets"
            emptyTitle="No tickets yet"
            emptyMessage="When you raise a ticket, you can follow its status here."
            onClear={() => {
              setFilter("all");
              setQuery("");
            }}
            renderTicket={(ticket) => <TicketCard key={ticket.id} ticket={ticket} onAttachment={(t) => void openAttachment(t)} />}
          />
        </section>
      </div>
    </div>
  );
}

function HrHelpDesk() {
  const { showToast } = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<number | null>(null);
  const [summary, setSummary] = useState<TicketSummary | null>(null);
  const [summaryVersion, setSummaryVersion] = useState(0);
  const { tickets, setTickets, error, retry } = useTickets((signal) => fetchAllTickets(filter === "all" ? undefined : filter, signal), filter);
  const openAttachment = useOpenAttachment(fetchAnyTicketAttachment);
  const term = query.trim().toLowerCase();
  const visible = (tickets ?? []).filter((t) => matchesSearch(t, term));

  // Counts for every status come from the server's summary (the list itself only holds the selected status).
  useEffect(() => {
    const controller = new AbortController();
    fetchTicketSummary(controller.signal)
      .then(setSummary)
      .catch(() => !controller.signal.aborted && setSummary(null)); // the queue still works without the counts
    return () => controller.abort();
  }, [summaryVersion]);

  const changeStatus = async (ticket: Ticket, status: TicketStatus) => {
    setSaving(ticket.id);
    try {
      const updated = await updateTicketStatus(ticket.id, status);
      setTickets((prev) => (prev ?? []).map((t) => (t.id === updated.id ? updated : t)).filter((t) => filter === "all" || t.status === filter));
      setSummaryVersion((n) => n + 1);
      showToast(`${updated.reference} is now ${TICKET_STATUSES.find((s) => s.value === status)?.label}.`);
    } catch (caught) {
      showToast(caught instanceof ApiError ? caught.message : "The ticket couldn't be updated.", "error");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Help Desk" description="Employee support requests. Update each ticket's status as you work on it." />
      {summary && <StatusSummary counts={summary.byStatus} total={summary.total} selected={filter} onSelect={setFilter} label="Tickets by status" />}
      <section aria-labelledby="queue-heading" className="rounded-panel border border-line bg-white shadow-card">
        <div className="space-y-3 border-b border-line px-5 pt-5 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SectionHeader id="queue-heading" title="Ticket queue" />
            <SearchInput value={query} onChange={setQuery} label="Search tickets" placeholder="Search by ID, subject, employee…" className="sm:w-72" />
          </div>
          <SegmentedTabs
            variant="underline"
            label="Filter tickets by status"
            value={filter}
            onChange={setFilter}
            options={[{ value: "all", label: "All" }, ...TICKET_STATUSES.map((s) => ({ value: s.value, label: s.label }))]}
          />
        </div>
        <TicketListBody
          tickets={tickets}
          visible={visible}
          error={error}
          retry={retry}
          label="Ticket queue"
          emptyTitle="No tickets here"
          emptyMessage="There are no tickets with this status."
          onClear={() => {
            setFilter("all");
            setQuery("");
          }}
          renderTicket={(ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} onAttachment={(t) => void openAttachment(t)}>
              <label className="ml-auto flex items-center gap-2 text-xs font-medium text-slate-500">
                Status
                <select
                  value={ticket.status}
                  disabled={saving === ticket.id}
                  onChange={(e) => void changeStatus(ticket, e.target.value as TicketStatus)}
                  className="focus-ring h-8 rounded-md border border-line-strong bg-white px-2 text-xs text-navy-900 hover:border-primary-200 disabled:opacity-60"
                  aria-label={`Status of ${ticket.reference}`}
                >
                  {TICKET_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </TicketCard>
          )}
        />
      </section>
    </div>
  );
}

/** Employees raise and track their own tickets; HR works through every ticket. */
export function HelpDeskPage() {
  const user = useCurrentUser();
  return user.role === "hr" ? <HrHelpDesk /> : <EmployeeHelpDesk />;
}
