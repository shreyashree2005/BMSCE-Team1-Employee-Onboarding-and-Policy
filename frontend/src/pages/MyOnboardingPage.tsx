import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ListTodo } from "lucide-react";
import { JourneyStepper } from "../components/journey/JourneyStepper";
import { CategoryFilter } from "../components/onboarding/CategoryFilter";
import { OnboardingDataGate } from "../components/onboarding/OnboardingDataGate";
import { TaskDetailPanel } from "../components/onboarding/TaskDetailPanel";
import { TaskDetailModal } from "../components/tasks/TaskDetailModal";
import { ProgressSummary } from "../components/tasks/ProgressSummary";
import { PriorityChecklist, useCollapsedGroups } from "../components/tasks/TaskGroups";
import { emptyFilterMessages, getTaskFilterOptions } from "../components/tasks/taskFilters";
import { Button } from "../components/ui/Button";
import { DemoBadge } from "../components/ui/DemoBadge";
import { EmptyState } from "../components/ui/EmptyState";
import { FilterChip } from "../components/ui/FilterChip";
import { PageHeader } from "../components/ui/PageHeader";
import { SearchInput } from "../components/ui/SearchInput";
import { SegmentedTabs } from "../components/ui/SegmentedTabs";
import { STAGE_ORDER } from "../config/stages";
import { useOnboarding } from "../context/OnboardingContext";
import { useMediaQuery } from "../hooks/useMediaQuery";
import type { OnboardingStageName, OnboardingTask, TaskCategory } from "../types/dashboard";
import { filterTasksByStatus, getCategoryProgress, getNextTask, getStageProgress, groupByPriority, type TaskFilter } from "../utils/onboarding";

export function MyOnboardingPage() {
  return (
    <OnboardingDataGate skeleton="checklist">
      <MyOnboardingContent />
    </OnboardingDataGate>
  );
}

function MyOnboardingContent() {
  const { tasks } = useOnboarding();
  const [searchParams, setSearchParams] = useSearchParams();
  // ?status= (e.g. from the overview's status counts) preselects that status tab.
  const [statusFilter, setStatusFilter] = useState<TaskFilter>(() => {
    const requested = searchParams.get("status");
    return requested === "pending" || requested === "in_progress" || requested === "completed" ? requested : "all";
  });
  // ?stage= (from a journey stage on Home) preselects that stage.
  const [stageFilter, setStageFilter] = useState<OnboardingStageName | null>(() => {
    const requested = searchParams.get("stage");
    return STAGE_ORDER.find((stage) => stage === requested) ?? null;
  });
  const groupsState = useCollapsedGroups();
  const [categoryFilter, setCategoryFilter] = useState<TaskCategory | null>(null);
  const [query, setQuery] = useState("");
  const wide = useMediaQuery("(min-width: 1280px)");

  const stages = getStageProgress(tasks);
  const nextTask = getNextTask(tasks);

  // The open task lives in the URL (?task=id) so notifications and search can deep-link to it.
  // On wide screens it shows in the side panel (defaulting to the next task); otherwise in a modal.
  const requestedTask = tasks.find((task) => task.id === searchParams.get("task"));
  const panelTask = requestedTask ?? nextTask;
  const openTask = (task: OnboardingTask) => setSearchParams({ task: task.id }, { replace: wide });
  const closeTask = () => setSearchParams({}, { replace: true });

  const term = query.trim().toLowerCase();
  // Each filter's counts reflect the other active filters, so the numbers match what is shown.
  const matchesStageAndSearch = (task: OnboardingTask) =>
    (!stageFilter || task.stage === stageFilter) && (!term || task.title.toLowerCase().includes(term) || task.description.toLowerCase().includes(term));
  const scopedTasks = tasks.filter((task) => matchesStageAndSearch(task) && (!categoryFilter || task.category === categoryFilter));
  const categoryScope = filterTasksByStatus(tasks.filter(matchesStageAndSearch), statusFilter);
  const visibleTasks = filterTasksByStatus(scopedTasks, statusFilter);
  const categoryTotals = getCategoryProgress(tasks);
  const categoryOptions = categoryTotals.map(({ category }) => ({ category, count: categoryScope.filter((t) => t.category === category).length }));
  // Priority → Tasks (every status together; each row shows its own status). Empty groups are left out.
  const priorityGroups = groupByPriority(visibleTasks);
  const hasFilters = Boolean(stageFilter || categoryFilter || term || statusFilter !== "all");

  const clearFilters = () => {
    setStatusFilter("all");
    setStageFilter(null);
    setCategoryFilter(null);
    setQuery("");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Employee portal"
        title="All Tasks"
        description="Every onboarding task in one list. Filter by status, stage or category, and open a task to work on it."
        badge={<DemoBadge />}
      />

      <section aria-label="Onboarding journey" className="rounded-panel border border-line bg-white px-3 py-5 shadow-card sm:px-5 sm:py-6">
        <div className="mb-4 flex items-center justify-between px-2">
          <h2 className="text-[15px] font-semibold tracking-tight text-primary-700">Onboarding journey</h2>
          <p className="text-xs text-slate-500">Select a stage to filter your checklist</p>
        </div>
        <JourneyStepper stages={stages} variant="detailed" selected={stageFilter} onSelect={setStageFilter} />
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-labelledby="checklist-heading" className="rounded-panel border border-line bg-white shadow-card">
          <div className="space-y-4 border-b border-line px-5 pt-5 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 id="checklist-heading" className="text-[15px] font-semibold tracking-tight text-primary-700">
                  Your onboarding checklist
                </h2>
                <p className="mt-0.5 text-[13px] text-slate-500">Grouped by priority. Each task shows its status. Select a task to open it and complete its steps.</p>
              </div>
              <SearchInput value={query} onChange={setQuery} label="Search checklist" placeholder="Search tasks…" className="sm:w-60" />
            </div>
            <CategoryFilter categories={categoryOptions} total={categoryScope.length} selected={categoryFilter} onSelect={setCategoryFilter} />
            {stageFilter && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500">Stage:</span>
                <FilterChip label={stageFilter} onRemove={() => setStageFilter(null)} />
              </div>
            )}
            <SegmentedTabs variant="underline" label="Filter checklist by status" options={getTaskFilterOptions(scopedTasks)} value={statusFilter} onChange={setStatusFilter} />
          </div>

          {priorityGroups.length === 0 ? (
            <EmptyState
              icon={ListTodo}
              {...emptyFilterMessages[term || stageFilter || categoryFilter ? "all" : statusFilter]}
              action={
                hasFilters && (
                  <Button variant="secondary" size="sm" onClick={clearFilters}>
                    Clear all filters
                  </Button>
                )
              }
            />
          ) : (
            <PriorityChecklist groups={priorityGroups} onOpen={openTask} selectedTaskId={wide ? panelTask?.id : undefined} isOpen={groupsState.isOpen} toggle={groupsState.toggle} />
          )}
        </section>

        {/* Right column: the progress summary (above the checklist on narrow screens), then the task details. */}
        <aside aria-label="Progress and task details" className="order-first space-y-6 xl:order-none xl:self-stretch">
          <ProgressSummary tasks={tasks} />
          {/* Only the details panel stays in view while scrolling, so a long task form is never cut off. */}
          {wide && (
            <div className="sticky top-24">
              <TaskDetailPanel task={panelTask} />
            </div>
          )}
        </aside>
      </div>

      {!wide && <TaskDetailModal task={requestedTask} onClose={closeTask} />}
    </div>
  );
}
