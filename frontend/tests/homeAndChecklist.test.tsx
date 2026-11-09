import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { OnboardingTask } from "../src/types/dashboard";
import { emergencyContactAction, employeeUser, mockApi, renderApp, signedInRoutes, tasks } from "./helpers";

function checklist() {
  return screen.getByRole("region", { name: "Your onboarding checklist" });
}

function group(list: HTMLElement, name: RegExp) {
  return within(list).getByRole("region", { name });
}

function priorityHeadings(list: HTMLElement) {
  return within(list).getAllByRole("heading", { level: 3 }).map((h) => h.textContent?.replace(/\d.*$/, ""));
}

describe("All Tasks: the full checklist, grouped by priority only", () => {
  it("shows each priority heading once, with every task under its priority and its own status beside it", async () => {
    mockApi(signedInRoutes(employeeUser));
    renderApp("/onboarding");
    await screen.findByRole("heading", { name: "Your onboarding checklist" });
    const list = checklist();

    // Priority headings appear once each, in order, as the top-level groups. No status parent groups.
    expect(priorityHeadings(list)).toEqual(["High Priority", "Medium Priority", "Low Priority"]);
    expect(within(list).queryByRole("heading", { name: /^(Pending|In Progress|Completed)/ })).not.toBeInTheDocument();

    // High holds an in-progress and a completed task together; nothing is dropped.
    const high = group(list, /^High Priority$/);
    expect(within(high).getAllByRole("listitem").map((r) => r.textContent)).toEqual([
      expect.stringContaining("Information Security training"),
      expect.stringContaining("Complete HR orientation"),
    ]);
    expect(within(group(list, /^Medium Priority$/)).getByText("Submit emergency contact details")).toBeInTheDocument();
    expect(within(group(list, /^Low Priority$/)).getByText("Set 30-day goals")).toBeInTheDocument();
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);

    // Each row shows one small status indicator matching the task's real status, and never repeats the priority.
    const statusOf = (title: string) => within(within(list).getByText(title).closest("li") as HTMLElement).getByTestId("task-status").textContent;
    expect(statusOf("Information Security training")).toBe("In Progress");
    expect(statusOf("Complete HR orientation")).toBe("Completed");
    expect(statusOf("Submit emergency contact details")).toBe("Pending");
    expect(statusOf("Set 30-day goals")).toBe("Pending");
    for (const row of within(list).getAllByRole("listitem")) expect(row.textContent).not.toMatch(/(High|Medium|Low) priority/i);

    // Completed tasks stay visible with a muted, struck-through title; due dates still show for open work.
    expect(within(high).getByText("Complete HR orientation")).toHaveClass("line-through");
    expect(within(list).getByText(/Overdue/)).toBeInTheDocument();
  });

  it("collapses and expands each priority group on its own", async () => {
    mockApi(signedInRoutes(employeeUser));
    renderApp("/onboarding");
    await screen.findByRole("heading", { name: "Your onboarding checklist" });
    const user = userEvent.setup();
    const list = checklist();

    const highToggle = within(list).getByRole("button", { name: /^High Priority/ });
    expect(highToggle).toHaveAttribute("aria-expanded", "true");
    await user.click(highToggle);
    expect(highToggle).toHaveAttribute("aria-expanded", "false");
    expect(within(list).queryByText("Information Security training")).not.toBeInTheDocument();
    expect(within(list).queryByText("Complete HR orientation")).not.toBeInTheDocument();
    expect(within(list).getByText("Submit emergency contact details")).toBeInTheDocument();
    await user.click(highToggle);
    expect(within(list).getByText("Information Security training")).toBeInTheDocument();

    const lowToggle = within(list).getByRole("button", { name: /^Low Priority/ });
    await user.click(lowToggle);
    expect(lowToggle).toHaveAttribute("aria-expanded", "false");
    expect(within(list).queryByText("Set 30-day goals")).not.toBeInTheDocument();
  });

  it("shows a progress summary of every task, which searching doesn't change", async () => {
    mockApi(signedInRoutes(employeeUser));
    renderApp("/onboarding");
    await screen.findByRole("heading", { name: "Your onboarding checklist" });
    const user = userEvent.setup();
    const summary = screen.getByRole("region", { name: "Progress summary" });
    const check = () => {
      expect(within(summary).getByTestId("summary-total")).toHaveTextContent("4");
      expect(within(summary).getByText("25%")).toBeInTheDocument();
      expect(within(summary).getByRole("progressbar", { name: "Pending: 2 of 4 tasks" })).toBeInTheDocument();
      expect(within(summary).getByRole("progressbar", { name: "In Progress: 1 of 4 tasks" })).toBeInTheDocument();
      expect(within(summary).getByRole("progressbar", { name: "Completed: 1 of 4 tasks" })).toBeInTheDocument();
    };
    check();

    await user.type(screen.getByLabelText("Search checklist"), "goals");
    const list = checklist();
    expect(within(list).getByText("Set 30-day goals")).toBeInTheDocument();
    expect(within(list).queryByText("Information Security training")).not.toBeInTheDocument();
    expect(priorityHeadings(list)).toEqual(["Low Priority"]);
    check();
  });

  it.each([
    ["pending", ["Submit emergency contact details", "Set 30-day goals"], ["Information Security training", "Complete HR orientation"], ["Medium Priority", "Low Priority"]],
    ["in_progress", ["Information Security training"], ["Submit emergency contact details", "Complete HR orientation"], ["High Priority"]],
    ["completed", ["Complete HR orientation"], ["Submit emergency contact details", "Information Security training"], ["High Priority"]],
  ])("?status=%s shows only those tasks, still grouped by priority", async (status, shown, hidden, headings) => {
    mockApi(signedInRoutes(employeeUser));
    renderApp(`/onboarding?status=${status}`);
    await screen.findByRole("heading", { name: "Your onboarding checklist" });
    const list = checklist();
    expect(priorityHeadings(list)).toEqual(headings);
    for (const title of shown) expect(within(list).getByText(title)).toBeInTheDocument();
    for (const title of hidden) expect(within(list).queryByText(title)).not.toBeInTheDocument();
  });

  it("shows whatever role-specific checklist the API returns, grouped correctly", async () => {
    const engineering: OnboardingTask[] = [
      { ...tasks[0], id: "e1", title: "Set up the development environment", category: "IT Setup", priority: "high", status: "pending", dueDate: "2026-11-07" },
      { ...tasks[0], id: "e2", title: "Review the architecture guide", category: "Learning", priority: "medium", status: "in_progress", dueDate: "2026-11-10" },
    ];
    mockApi({ ...signedInRoutes(employeeUser), "GET /api/v1/onboarding/tasks": () => ({ body: engineering }) });
    renderApp("/onboarding");
    await screen.findByRole("heading", { name: "Your onboarding checklist" });
    const list = checklist();
    expect(within(group(list, /^High Priority$/)).getByText("Set up the development environment")).toBeInTheDocument();
    expect(within(group(list, /^Medium Priority$/)).getByText("Review the architecture guide")).toBeInTheDocument();
    expect(within(list).queryByRole("region", { name: /^Low Priority$/ })).not.toBeInTheDocument();
    expect(within(list).queryByText("Submit emergency contact details")).not.toBeInTheDocument();
  });
});

describe("Home navigation", () => {
  it("opens All Tasks filtered by the selected journey stage", async () => {
    mockApi(signedInRoutes(employeeUser));
    renderApp("/");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: /^Documentation: 0 of 1 tasks done/ }));

    expect(await screen.findByRole("heading", { name: "Your onboarding checklist" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove filter: Documentation" })).toBeInTheDocument();
    const list = checklist();
    expect(within(list).getByText("Submit emergency contact details")).toBeInTheDocument();
    expect(within(list).queryByText("Information Security training")).not.toBeInTheDocument();
    expect(within(list).queryByText("Set 30-day goals")).not.toBeInTheDocument();
  });

  it("goes from Today's Tasks to the full checklist", async () => {
    mockApi(signedInRoutes(employeeUser));
    renderApp("/");
    const user = userEvent.setup();
    const today = (await screen.findByRole("heading", { name: "Today's Tasks" })).closest("section") as HTMLElement;
    await user.click(within(today).getByRole("link", { name: /All tasks/ }));
    expect(await screen.findByRole("heading", { name: "All Tasks", level: 1 })).toBeInTheDocument();
    expect(within(checklist()).getByText("Set 30-day goals")).toBeInTheDocument();
  });

  it("Start Task on Home opens the real task; completing it updates progress and the next recommendation", async () => {
    const { requests } = mockApi({
      ...signedInRoutes(employeeUser),
      "PATCH /api/v1/onboarding/tasks/t2": (request) => ({
        body: { ...tasks[1], ...(request.body as object), firstStartedAt: "2026-11-07T11:58:00Z", activeSince: "2026-11-07T11:58:00Z", timeSpentSeconds: 0 },
      }),
      "GET /api/v1/onboarding/tasks/t2/action": () => ({
        body: emergencyContactAction({ task: { ...tasks[1], status: "in_progress", firstStartedAt: "2026-11-07T11:58:00Z", activeSince: "2026-11-07T11:58:00Z", timeSpentSeconds: 0 } }),
      }),
      "POST /api/v1/onboarding/tasks/t2/action": (request) => ({
        body: emergencyContactAction({
          task: { ...tasks[1], status: "completed", completedAt: "2026-11-07T12:00:00Z", firstStartedAt: "2026-11-07T11:58:00Z", timeSpentSeconds: 95 },
          completed: true,
          completedAt: "2026-11-07T12:00:00Z",
          values: (request.body as { values: Record<string, string> }).values,
        }),
      }),
    });
    renderApp("/");
    const user = userEvent.setup();
    const today = (await screen.findByRole("heading", { name: "Today's Tasks" })).closest("section") as HTMLElement;
    const progress = screen.getByRole("heading", { name: "Your Progress" }).closest("section") as HTMLElement;
    expect(within(progress).getByText("1 of 4 tasks complete · 1 overdue")).toBeInTheDocument();

    await user.click(within(today).getByRole("button", { name: "Start “Submit emergency contact details”" }));
    await waitFor(() => expect(requests.find((r) => r.method === "PATCH")?.body).toEqual({ status: "in_progress" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(await within(dialog).findByLabelText("Contact name"), "Asha Nambiar");
    await user.selectOptions(within(dialog).getByLabelText("Relationship"), "Parent");
    await user.type(within(dialog).getByLabelText("Phone number"), "+91 98450 12345");
    await user.click(within(dialog).getByRole("button", { name: "Submit" }));

    // Only after the server confirms completion do progress and the recommendation change.
    // Generous waits: typing into three fields is slow when the whole suite runs in parallel.
    expect(await screen.findByText("Great job! 🎉", undefined, { timeout: 5000 })).toBeInTheDocument();
    await waitFor(() => expect(within(progress).getByText("2 of 4 tasks complete")).toBeInTheDocument(), { timeout: 5000 });
    expect(within(progress).getByText("50%")).toBeInTheDocument();
    const next = screen.getByRole("heading", { name: "Your Next Step" }).closest("section") as HTMLElement;
    expect(within(next).getByText("Information Security training")).toBeInTheDocument();
    expect(within(next).getByRole("button", { name: /Continue task/ })).toBeInTheDocument();
  }, 30000);
});
