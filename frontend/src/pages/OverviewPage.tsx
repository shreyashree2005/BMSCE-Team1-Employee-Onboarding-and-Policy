import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DocumentsSection } from "../components/home/DocumentsSection";
import { HelpSection } from "../components/home/HelpSection";
import { JourneySections } from "../components/home/JourneySections";
import { NextStepSection } from "../components/home/NextStepSection";
import { OnboardingCalendar } from "../components/home/OnboardingCalendar";
import { ProgressSection } from "../components/home/ProgressSection";
import { TodaySection } from "../components/home/TodaySection";
import { WelcomeSection } from "../components/home/WelcomeSection";
import { OnboardingDataGate } from "../components/onboarding/OnboardingDataGate";
import { TaskDetailModal } from "../components/tasks/TaskDetailModal";
import { useCurrentUser, useProfile } from "../context/AuthContext";
import { useOnboarding } from "../context/OnboardingContext";
import { useOnboardingCalendar } from "../hooks/useOnboardingCalendar";
import { useTaskActions } from "../hooks/useTaskActions";
import type { OnboardingTask } from "../types/dashboard";
import { getNextTask, getStageProgress, getTaskCounts, isBlocked } from "../utils/onboarding";

export function OverviewPage() {
  return (
    <OnboardingDataGate skeleton="overview">
      <GuidedHome />
    </OnboardingDataGate>
  );
}

/**
 * The employee's overview: welcome, the one recommended next step, today's tasks (by priority), overall progress,
 * the journey stages (which open All Tasks filtered by stage), the calendar and help. The full checklist lives on
 * All Tasks only. Tasks open in place (?task=id).
 */
function GuidedHome() {
  const user = useCurrentUser();
  const employee = useProfile();
  const { tasks } = useOnboarding();
  const { updateStatus } = useTaskActions();
  const { calendar, error: calendarError } = useOnboardingCalendar(15);
  const [searchParams, setSearchParams] = useSearchParams();
  const [starting, setStarting] = useState(false);

  const counts = getTaskCounts(tasks);
  const next = getNextTask(tasks, calendar?.today);
  const openTask = tasks.find((t) => t.id === searchParams.get("task"));
  const open = (task: OnboardingTask) => setSearchParams({ task: task.id });
  const close = () => setSearchParams({}, { replace: true });

  // "Start Task": start it (the server records the start time), then open it to do the work.
  const start = async (task: OnboardingTask) => {
    if (task.status === "pending" && !isBlocked(task, tasks)) {
      setStarting(true);
      await updateStatus(task, "in_progress");
      setStarting(false);
    }
    open(task);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <WelcomeSection employee={employee} jobRole={user.profile?.jobRoleLabel ?? employee.role} remaining={counts.remaining} total={counts.total} />
      <NextStepSection task={next} starting={starting} onStart={(task) => void start(task)} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <TodaySection tasks={tasks} calendar={calendar} onOpen={open} onStart={(task) => void start(task)} />
        <ProgressSection tasks={tasks} />
      </div>
      <JourneySections stages={getStageProgress(tasks)} />
      <DocumentsSection />
      <OnboardingCalendar calendar={calendar} error={calendarError} tasks={tasks} onOpen={open} />
      <HelpSection employee={employee} />
      <TaskDetailModal task={openTask} onClose={close} />
    </div>
  );
}
