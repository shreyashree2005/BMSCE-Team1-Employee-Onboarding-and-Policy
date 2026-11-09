import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { RefreshCw, SearchX, Users } from "lucide-react";
import { EmployeeDetailPanel } from "../components/hr/EmployeeDetailPanel";
import { EmployeeTable } from "../components/hr/EmployeeTable";
import { hrStatusMeta } from "../components/hr/HrStatusBadge";
import { HrOverviewPanel } from "../components/hr/HrOverviewPanel";
import { Button } from "../components/ui/Button";
import { DemoBadge } from "../components/ui/DemoBadge";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { PageHeader } from "../components/ui/PageHeader";
import { SearchInput } from "../components/ui/SearchInput";
import { SegmentedTabs, type SegmentedTabOption } from "../components/ui/SegmentedTabs";
import { Skeleton } from "../components/ui/Skeleton";
import { StatStrip } from "../components/ui/StatStrip";
import { ApiError } from "../services/apiClient";
import { fetchHrEmployee, fetchHrEmployees, fetchHrSummary } from "../services/hrApi";
import type { HrEmployeeDetail, HrEmployeeList, HrEmployeeRecord, HrOnboardingStatus, HrSummary } from "../types/hr";
import { countForStatus, HR_STATUS_ORDER } from "../utils/hr";

type StatusFilter = "all" | HrOnboardingStatus;
type LoadState = "loading" | "ready" | "error";

const ALL_DEPARTMENTS = "";
const SEARCH_DEBOUNCE_MS = 250;

function errorText(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong. Please try again.";
}

function isStatus(value: string | null): value is HrOnboardingStatus {
  return value !== null && (HR_STATUS_ORDER as string[]).includes(value);
}

export function HrDashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get("status");
  const statusFilter: StatusFilter = isStatus(statusParam) ? statusParam : "all";

  // Organisation overview: summary + every employee (for the department breakdown).
  const [overview, setOverview] = useState<{ summary: HrSummary; everyone: HrEmployeeRecord[] } | null>(null);
  const [overviewState, setOverviewState] = useState<LoadState>("loading");
  const [overviewError, setOverviewError] = useState("");
  const [refreshCount, setRefreshCount] = useState(0);

  // Filtered table, fetched from the API with the current filters.
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [department, setDepartment] = useState(ALL_DEPARTMENTS);
  const [list, setList] = useState<HrEmployeeList | null>(null);
  const [listState, setListState] = useState<LoadState>("loading");
  const [listError, setListError] = useState("");

  const [selectedId, setSelectedId] = useState<number | undefined>();
  const [detail, setDetail] = useState<HrEmployeeDetail | null>(null);
  const [detailState, setDetailState] = useState<LoadState>("loading");
  const [detailRetry, setDetailRetry] = useState(0);
  const detailRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    setOverviewState((state) => (state === "ready" ? state : "loading"));
    Promise.all([fetchHrSummary(controller.signal), fetchHrEmployees({}, controller.signal)])
      .then(([summary, all]) => {
        setOverview({ summary, everyone: all.employees });
        setOverviewState("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setOverviewError(errorText(error));
        setOverviewState("error");
      });
    return () => controller.abort();
  }, [refreshCount]);

  useEffect(() => {
    const controller = new AbortController();
    setListState("loading");
    fetchHrEmployees({ search: debouncedQuery, department: department || undefined, status: statusFilter === "all" ? undefined : statusFilter }, controller.signal)
      .then((result) => {
        setList(result);
        setListState("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setListError(errorText(error));
        setListState("error");
      });
    return () => controller.abort();
  }, [debouncedQuery, department, statusFilter, refreshCount]);

  const employees = list?.employees ?? [];
  const selectedRecord = employees.find((e) => e.id === selectedId) ?? employees[0];
  const selectedRecordId = selectedRecord?.id;

  useEffect(() => {
    if (selectedRecordId === undefined) {
      setDetail(null);
      return;
    }
    const controller = new AbortController();
    setDetailState("loading");
    fetchHrEmployee(selectedRecordId, controller.signal)
      .then((result) => {
        setDetail(result);
        setDetailState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setDetailState("error");
      });
    return () => controller.abort();
  }, [selectedRecordId, detailRetry, refreshCount]);

  const setStatusFilter = useCallback(
    (status: StatusFilter) => {
      setSearchParams(
        (params) => {
          const next = new URLSearchParams(params);
          if (status === "all") next.delete("status");
          else next.set("status", status);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const selectRecord = (record: HrEmployeeRecord) => {
    setSelectedId(record.id);
    // On stacked (narrow) layouts, bring the details into view.
    if (window.matchMedia("(max-width: 1279px)").matches) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const resetFilters = () => {
    setQuery("");
    setDebouncedQuery("");
    setDepartment(ALL_DEPARTMENTS);
    setStatusFilter("all");
  };

  const header = (
    <PageHeader
      eyebrow="People analytics"
      title="HR Dashboard"
      description="Monitor onboarding across new hires, spot who needs support and follow up early."
      badge={<DemoBadge label="Fictional demo employees" />}
      actions={
        <Button variant="secondary" size="sm" onClick={() => setRefreshCount((c) => c + 1)} disabled={overviewState === "loading"}>
          <RefreshCw size={14} className={overviewState === "loading" && overview ? "animate-spin" : ""} aria-hidden="true" />
          Refresh
        </Button>
      }
    />
  );

  if (overviewState === "error" && !overview) {
    return (
      <div className="space-y-6">
        {header}
        <div className="rounded-panel border border-line bg-white shadow-card">
          <ErrorState title="Couldn't load the HR dashboard" message={overviewError} onRetry={() => setRefreshCount((c) => c + 1)} />
        </div>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="space-y-6" aria-busy="true">
        {header}
        <span className="sr-only" role="status">
          Loading HR dashboard…
        </span>
        <Skeleton className="h-48 w-full rounded-panel" />
        <Skeleton className="h-24 w-full rounded-panel" />
        <Skeleton className="h-96 w-full rounded-panel" />
      </div>
    );
  }

  const { summary, everyone } = overview;
  const counts = list?.statusCounts ?? summary.statusCounts;
  const statusOptions: SegmentedTabOption<StatusFilter>[] = [
    { value: "all", label: "All", count: list ? list.statusCounts.atRisk + list.statusCounts.notStarted + list.statusCounts.onTrack + list.statusCounts.completed : summary.totalEmployees },
    ...HR_STATUS_ORDER.map((status) => ({ value: status, label: hrStatusMeta[status].label, count: countForStatus(counts, status) })),
  ];
  const inProgressEmployees = summary.totalEmployees - summary.statusCounts.completed;

  return (
    <div className="space-y-6">
      {header}

      {summary.totalEmployees === 0 ? (
        <div className="rounded-panel border border-line bg-white shadow-card">
          <EmptyState icon={Users} title="No employees yet" message="Employee accounts and their onboarding checklists will appear here." />
        </div>
      ) : (
        <>
          <HrOverviewPanel summary={summary} employees={everyone} activeStatus={statusFilter} onStatusSelect={setStatusFilter} />

          <StatStrip
            label="Onboarding totals"
            items={[
              { label: "Employees onboarding", value: inProgressEmployees, caption: `${summary.totalEmployees} employees in total` },
              { label: "Completed onboarding", value: summary.statusCounts.completed, caption: "All checklist tasks finished" },
              { label: "Open tasks", value: summary.openTasks, caption: `${summary.inProgressTasks} in progress across employees` },
              {
                label: "Overdue tasks",
                value: <span className={summary.overdueTasks > 0 ? "text-rose-600" : undefined}>{summary.overdueTasks}</span>,
                caption: `${summary.statusCounts.atRisk} employee${summary.statusCounts.atRisk === 1 ? "" : "s"} need follow-up`,
              },
            ]}
          />

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section aria-labelledby="employee-table-heading" className="rounded-panel border border-line bg-white shadow-card">
              <div className="space-y-4 border-b border-line px-5 pt-5 sm:px-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 id="employee-table-heading" className="text-[15px] font-semibold tracking-tight text-primary-700">
                      Employee progress
                    </h2>
                    <p className="mt-0.5 text-[13px] text-slate-500">Employees needing attention are listed first</p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <SearchInput value={query} onChange={setQuery} label="Search employees" placeholder="Search name, email or role…" className="sm:w-60" />
                    <label htmlFor="department-filter" className="sr-only">
                      Filter by department
                    </label>
                    <select
                      id="department-filter"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="focus-ring h-10 rounded-lg border border-line bg-white px-3 text-[13px] text-navy-900 focus:border-primary-400 focus:outline-none"
                    >
                      <option value={ALL_DEPARTMENTS}>All departments</option>
                      {summary.departments.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <SegmentedTabs variant="underline" label="Filter employees by status" options={statusOptions} value={statusFilter} onChange={setStatusFilter} />
              </div>

              <div aria-live="polite" aria-busy={listState === "loading"}>
                {listState === "error" ? (
                  <ErrorState title="Couldn't load employees" message={listError} onRetry={() => setRefreshCount((c) => c + 1)} />
                ) : listState === "loading" && !list ? (
                  <div className="space-y-3 p-5 sm:p-6">
                    {[0, 1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : employees.length === 0 ? (
                  <EmptyState
                    icon={SearchX}
                    title="No employees match"
                    message="Try a different name, department or status."
                    action={
                      <Button variant="secondary" size="sm" onClick={resetFilters}>
                        Reset filters
                      </Button>
                    }
                  />
                ) : (
                  <div className={listState === "loading" ? "opacity-60 transition-opacity" : "transition-opacity"}>
                    <EmployeeTable records={employees} selectedId={selectedRecord?.id} onSelect={selectRecord} />
                  </div>
                )}
              </div>
              <p className="border-t border-line px-5 py-3 text-xs text-slate-500 sm:px-6">
                Showing {list?.totalMatching ?? 0} of {list?.totalEmployees ?? summary.totalEmployees} employees
              </p>
            </section>

            <div className="xl:sticky xl:top-24">
              <EmployeeDetailPanel
                ref={detailRef}
                record={selectedRecord}
                detail={detail && detail.employee.id === selectedRecord?.id ? detail : null}
                detailState={detail && detail.employee.id === selectedRecord?.id ? detailState : detailState === "error" ? "error" : "loading"}
                onRetryDetail={() => setDetailRetry((c) => c + 1)}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
