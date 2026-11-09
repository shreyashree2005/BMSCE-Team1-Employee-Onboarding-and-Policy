import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import App from "../src/App";
import { AuthProvider } from "../src/context/AuthContext";
import { ToastProvider } from "../src/context/ToastContext";
import type { AuthUser } from "../src/types/auth";
import type { OnboardingTask } from "../src/types/dashboard";
import type { TaskActionState } from "../src/types/taskActions";
import type { CalendarDay, OnboardingCalendar } from "../src/types/calendar";
import type { HrEmployeeList, HrEmployeeRecord, HrSummary } from "../src/types/hr";

export interface RecordedRequest {
  method: string;
  path: string;
  search: string;
  headers: Record<string, string>;
  body: unknown;
  credentials: RequestCredentials | undefined;
}

/** `raw` returns that Response as-is (e.g. a streamed body); otherwise `body` is sent as JSON with `status`. */
type Handler = (request: RecordedRequest) => { status?: number; body?: unknown; raw?: Response } | undefined;

const CHAT_PATH = "/api/v1/policies/chat";

/** A newline-delimited JSON stream of `events`, like the Policy Assistant's streaming endpoint. */
export function ndjson(events: unknown[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "application/x-ndjson" } });
}

function json(status: number, body: unknown): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * Replaces fetch with an in-memory API. Routes are "METHOD /path" (query string excluded). Unmatched requests
 * fail the test loudly with a 599 so missing mocks are obvious.
 */
export function mockApi(routes: Record<string, Handler>) {
  const requests: RecordedRequest[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const headers = Object.fromEntries(Object.entries((init.headers as Record<string, string>) ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    const request: RecordedRequest = {
      method: (init.method ?? "GET").toUpperCase(),
      path: url.pathname,
      search: url.search,
      headers,
      body: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
      credentials: init.credentials,
    };
    requests.push(request);
    let handler = routes[`${request.method} ${request.path}`];
    let streamed = false;
    // Tests that mock the blocking chat endpoint also serve the streaming one: the same answer as one draft piece.
    if (!handler && request.method === "POST" && request.path === `${CHAT_PATH}/stream` && routes[`POST ${CHAT_PATH}`]) {
      handler = routes[`POST ${CHAT_PATH}`];
      streamed = true;
    }
    const result = handler?.(request);
    if (!result) return json(599, { detail: `No mock for ${request.method} ${request.path}` });
    if (result.raw) return result.raw;
    const status = result.status ?? 200;
    if (streamed && status < 400) {
      const answer = (result.body as { answer?: string }).answer ?? "";
      return ndjson([{ type: "status", stage: "generating", passages: 1 }, { type: "token", text: answer }, { type: "done", response: result.body }]);
    }
    return json(status, result.body ?? {});
  });
  vi.stubGlobal("fetch", fetchMock);
  return { requests, fetchMock };
}

export function renderApp(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

// ---- Fixtures (fictional) ----

export const employeeUser: AuthUser = {
  id: 2,
  email: "shreya.nambiar@onboardiq-demo.example",
  fullName: "Shreya Nambiar",
  role: "employee",
  profile: {
    firstName: "Shreya",
    lastName: "Nambiar",
    jobTitle: "Associate Software Engineer",
    department: "Product Engineering",
    location: "Bengaluru, India",
    startDate: "2026-11-02",
    managerName: "Priya Nair",
    buddyName: "Rohan Das",
    jobRole: "software_developer",
    jobRoleLabel: "Software Developer",
  },
  photoUrl: null,
  // A returning user: the first-visit tour and company introduction were already dismissed.
  tourCompleted: true,
  companyIntroSeen: true,
};

export const hrUser: AuthUser = { id: 1, email: "kavya.rao@onboardiq-demo.example", fullName: "Kavya Rao", role: "hr", profile: null };

export const tasks: OnboardingTask[] = [
  { id: "t1", stage: "Welcome", title: "Complete HR orientation", description: "Orientation.", category: "Orientation", dueDate: "2026-11-03", priority: "high", status: "completed", updatedAt: "2026-11-03T09:00:00Z" },
  { id: "t2", stage: "Documentation", title: "Submit emergency contact details", description: "Contacts.", category: "HR Forms", dueDate: "2026-11-05", priority: "medium", status: "pending", updatedAt: "2026-11-02T09:00:00Z", actionType: "form" },
  { id: "t3", stage: "Training", title: "Information Security training", description: "Training.", category: "Learning", dueDate: "2026-11-09", priority: "high", status: "in_progress", updatedAt: "2026-11-06T10:00:00Z", actionType: "training" },
  { id: "t4", stage: "Ready to Go", title: "Set 30-day goals", description: "Goals.", category: "Team", dueDate: "2026-11-20", priority: "low", status: "pending", updatedAt: "2026-11-02T09:00:00Z", actionType: "form" },
];

/**
 * A 15-day calendar from the fixed demo date (Saturday 2026-11-07), as the API builds it: Saturday/Sunday off,
 * Diwali (Balipadyami) on Nov 10, and each task on its due date.
 */
export function calendarFixture(taskList: OnboardingTask[] = tasks): OnboardingCalendar {
  const days = Array.from({ length: 15 }, (_, i) => {
    const date = new Date(Date.UTC(2026, 10, 7 + i)).toISOString().slice(0, 10);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const taskIds = taskList.filter((t) => t.dueDate === date).map((t) => t.id);
    const dayType = date === "2026-11-10" ? "festival_holiday" : weekday === 0 || weekday === 6 ? "weekly_off" : "working";
    const name = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
    const open = taskList.filter((t) => t.dueDate === date && t.status !== "completed").length;
    const title = open
      ? `${open} task${open === 1 ? "" : "s"} scheduled`
      : taskIds.length
        ? "All tasks completed"
        : dayType === "weekly_off"
          ? `${name} — Weekly Holiday`
          : dayType === "festival_holiday"
            ? "Festival Holiday — Diwali (Balipadyami)"
            : "No tasks scheduled";
    const reason = open
      ? null
      : taskIds.length
        ? "You've completed all the onboarding tasks scheduled for this date. Your next assigned activity is on Friday, November 20."
        : dayType === "weekly_off"
          ? `No onboarding activities are scheduled ${i === 0 ? "today" : "on this date"} because ${name} is a weekly holiday. Your next onboarding activity is scheduled for the next working day, Monday, November 9.`
          : dayType === "festival_holiday"
            ? "This date is a festival holiday: Diwali (Balipadyami). Your next assigned activity is on Friday, November 20."
            : "No onboarding tasks are scheduled for this date. Your next assigned activity is on Friday, November 20.";
    const note = !taskIds.length && dayType === "working" ? "Onboarding tasks are spread across your working days, so some days have nothing due." : null;
    return { date, dayType, holidayName: dayType === "festival_holiday" ? "Diwali (Balipadyami)" : null, taskIds, title, reason, note, nextWorkingDay: null, nextActivityDate: null } as CalendarDay;
  });
  return { today: "2026-11-07", weeklyOffDays: ["Saturday", "Sunday"], days };
}

/** The emergency-contact task's action (a server-defined form). */
export function emergencyContactAction(overrides: Partial<TaskActionState> = {}): TaskActionState {
  return {
    task: tasks[1], actionType: "form", kind: "emergency_contact", instructions: "Tell us who to contact in an emergency.",
    completed: false, completedAt: null, message: null,
    fields: [
      { name: "contact_name", label: "Contact name", type: "text", required: true, maxLength: 120, minLength: 2, pattern: null, patternMessage: null, options: [], help: null, fixedValue: null },
      { name: "relationship", label: "Relationship", type: "select", required: true, maxLength: 40, minLength: 0, pattern: null, patternMessage: null, options: ["Parent", "Spouse", "Sibling"], help: null, fixedValue: null },
      { name: "phone", label: "Phone number", type: "tel", required: true, maxLength: 20, minLength: 7, pattern: "^\\+?[0-9 ()-]{7,20}$", patternMessage: "Enter a valid phone number.", options: [], help: null, fixedValue: null },
    ],
    values: {}, maskedValues: {}, documents: [], items: [], policies: [], signature: null, sections: [], quiz: null,
    ...overrides,
  }; // fmt: skip
}

function employee(overrides: Partial<HrEmployeeRecord>): HrEmployeeRecord {
  return {
    id: 2, firstName: "Shreya", lastName: "Nambiar", fullName: "Shreya Nambiar", email: "shreya.nambiar@onboardiq-demo.example",
    jobTitle: "Associate Software Engineer", department: "Product Engineering", location: "Bengaluru, India", startDate: "2026-11-02",
    managerName: "Priya Nair", status: "at_risk", currentStage: "Documentation", totalTasks: 18, completedTasks: 10, inProgressTasks: 1,
    pendingTasks: 7, overdueTasks: 1, completionPercentage: 56, nextDueDate: "2026-11-05", lastActivityAt: "2026-11-06T10:00:00Z",
    ...overrides,
  }; // fmt: skip
}

export const hrEmployees: HrEmployeeRecord[] = [
  employee({}),
  employee({ id: 3, firstName: "Meera", lastName: "Pillai", fullName: "Meera Pillai", email: "meera.pillai@onboardiq-demo.example", jobTitle: "HR Generalist", department: "People Operations", status: "completed", currentStage: null, completedTasks: 18, inProgressTasks: 0, pendingTasks: 0, overdueTasks: 0, completionPercentage: 100, nextDueDate: null }),
];

export const hrSummary: HrSummary = {
  totalEmployees: 2,
  statusCounts: { atRisk: 1, notStarted: 0, onTrack: 0, completed: 1 },
  totalTasks: 36,
  completedTasks: 28,
  openTasks: 8,
  inProgressTasks: 1,
  overdueTasks: 1,
  averageCompletion: 78,
  departments: ["People Operations", "Product Engineering"],
  referenceDate: "2026-11-07",
};

export function employeeList(records: HrEmployeeRecord[] = hrEmployees): HrEmployeeList {
  const count = (s: string) => records.filter((r) => r.status === s).length;
  return {
    employees: records,
    statusCounts: { atRisk: count("at_risk"), notStarted: count("not_started"), onTrack: count("on_track"), completed: count("completed") },
    totalMatching: records.length,
    totalEmployees: hrEmployees.length,
  };
}

/** API routes for a signed-in user of the given role. */
export function signedInRoutes(user: AuthUser): Record<string, Handler> {
  return {
    "GET /api/v1/auth/me": () => ({ body: user }),
    "POST /api/v1/auth/logout": () => ({ status: 204 }),
    "GET /api/v1/onboarding/tasks": () => (user.role === "employee" ? { body: tasks } : { status: 403, body: { detail: "Forbidden" } }),
    "GET /api/v1/hr/summary": () => (user.role === "hr" ? { body: hrSummary } : { status: 403, body: { detail: "Forbidden" } }),
    "GET /api/v1/hr/employees": (request) => {
      if (user.role !== "hr") return { status: 403, body: { detail: "Forbidden" } };
      const status = new URLSearchParams(request.search).get("status");
      return { body: employeeList(status ? hrEmployees.filter((e) => e.status === status) : hrEmployees) };
    },
    "GET /api/v1/hr/employees/2": () => ({ body: { employee: hrEmployees[0], buddyName: "Rohan Das", progress: { totalTasks: 4, completedTasks: 1, inProgressTasks: 1, pendingTasks: 2, overdueTasks: 1, completionPercentage: 25, referenceDate: "2026-11-07", stages: [] }, tasks } }),
    "GET /api/v1/hr/employees/3": () => ({ body: { employee: hrEmployees[1], buddyName: null, progress: { totalTasks: 0, completedTasks: 0, inProgressTasks: 0, pendingTasks: 0, overdueTasks: 0, completionPercentage: 0, referenceDate: "2026-11-07", stages: [] }, tasks: [] } }),
    "GET /api/v1/onboarding/tasks/t2/action": () => ({ body: emergencyContactAction() }),
    "GET /api/v1/onboarding/calendar": () => (user.role === "employee" ? { body: calendarFixture() } : { status: 403, body: { detail: "Forbidden" } }),
    "GET /api/v1/policies/quizzes": () => ({ body: [] }),
    "PATCH /api/v1/auth/me/preferences": (request) => ({ body: { ...user, ...(request.body as object) } }),
    "GET /api/v1/policies/documents": () => ({ body: [] }),
    "GET /api/v1/policies/assistant/status": () => ({ body: { llmConfigured: false, llmModel: null, embeddingModel: "hashing", readyDocuments: 0 } }),
  };
}
