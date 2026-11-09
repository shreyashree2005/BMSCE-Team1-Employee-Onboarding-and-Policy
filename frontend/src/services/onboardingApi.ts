import type { OnboardingCalendar } from "../types/calendar";
import type { OnboardingTask, TaskStatus } from "../types/dashboard";
import { ApiError, apiRequest } from "./apiClient";

const BASE_PATH = "/api/v1/onboarding";

const TASK_STATUSES: readonly string[] = ["pending", "in_progress", "completed"];
const TASK_PRIORITIES: readonly string[] = ["high", "medium", "low"];

/** Checks the fields the UI relies on, so a contract mismatch fails loudly instead of rendering broken data. */
function isOnboardingTask(value: unknown): value is OnboardingTask {
  if (!value || typeof value !== "object") return false;
  const task = value as Record<string, unknown>;
  return (
    typeof task.id === "string" &&
    typeof task.title === "string" &&
    typeof task.description === "string" &&
    typeof task.stage === "string" &&
    typeof task.category === "string" &&
    typeof task.dueDate === "string" &&
    TASK_PRIORITIES.includes(String(task.priority)) &&
    TASK_STATUSES.includes(String(task.status))
  );
}

function assertTask(value: unknown): OnboardingTask {
  if (!isOnboardingTask(value)) throw new ApiError("The server returned an unexpected task format.", null);
  return value;
}

export async function fetchOnboardingTasks(signal?: AbortSignal): Promise<OnboardingTask[]> {
  const data = await apiRequest<unknown>(`${BASE_PATH}/tasks`, { signal });
  if (!Array.isArray(data)) throw new ApiError("The server returned an unexpected task list format.", null);
  return data.map(assertTask);
}

export async function fetchOnboardingTask(taskId: string, signal?: AbortSignal): Promise<OnboardingTask> {
  return assertTask(await apiRequest<unknown>(`${BASE_PATH}/tasks/${encodeURIComponent(taskId)}`, { signal }));
}

export async function updateOnboardingTaskStatus(taskId: string, status: TaskStatus): Promise<OnboardingTask> {
  const data = await apiRequest<unknown>(`${BASE_PATH}/tasks/${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  return assertTask(data);
}

/** The next days from today: tasks due each day, and why a day has none (weekend, holiday, nothing scheduled). */
export async function fetchOnboardingCalendar(days = 15, signal?: AbortSignal): Promise<OnboardingCalendar> {
  const data = await apiRequest<unknown>(`${BASE_PATH}/calendar?days=${days}`, { signal });
  if (!data || typeof data !== "object" || !Array.isArray((data as OnboardingCalendar).days)) {
    throw new ApiError("The server returned an unexpected calendar format.", null);
  }
  return data as OnboardingCalendar;
}
