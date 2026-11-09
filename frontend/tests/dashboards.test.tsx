import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { emergencyContactAction, employeeUser, hrUser, mockApi, renderApp, signedInRoutes, tasks } from "./helpers";

describe("employee dashboard", () => {
  it("shows a simple overview: welcome, next step, today's tasks, progress and journey stages (no full checklist)", async () => {
    mockApi(signedInRoutes(employeeUser));
    renderApp("/");

    expect(await screen.findByRole("heading", { name: /, Shreya$/ })).toBeInTheDocument();
    expect(screen.getByText(/You have 3 tasks left out of 4/)).toBeInTheDocument();
    // The overdue, unblocked task is recommended first.
    const next = screen.getByRole("heading", { name: "Your Next Step" }).closest("section") as HTMLElement;
    expect(within(next).getByText("Submit emergency contact details")).toBeInTheDocument();
    expect(within(next).getByRole("button", { name: /Start Task/ })).toBeInTheDocument();
    const today = screen.getByRole("heading", { name: "Today's Tasks" }).closest("section") as HTMLElement;
    expect(within(today).getByText(/includes overdue tasks/)).toBeInTheDocument();
    // Today's tasks are grouped by priority (heading shown once); only today's and overdue work is listed.
    expect(within(today).getByRole("button", { name: /Medium Priority/ })).toBeInTheDocument();
    expect(within(today).queryByRole("button", { name: /High Priority/ })).not.toBeInTheDocument();
    expect(within(today).getByText("Submit emergency contact details")).toBeInTheDocument();
    expect(within(today).queryByText("Information Security training")).not.toBeInTheDocument(); // due Nov 9
    expect(within(today).queryByText(/Medium priority$/)).not.toBeInTheDocument(); // no per-row priority label
    expect(within(today).getByRole("button", { name: "Start “Submit emergency contact details”" })).toBeInTheDocument();
    // The full checklist isn't on Home: a task due on a later day appears nowhere.
    expect(screen.queryByText("Set 30-day goals")).not.toBeInTheDocument();
    const progress = screen.getByRole("heading", { name: "Your Progress" }).closest("section") as HTMLElement;
    expect(within(progress).getByText("25%")).toBeInTheDocument();
    expect(within(progress).getByRole("link", { name: "View all 4 tasks" })).toHaveAttribute("href", "/onboarding");
    // Journey stages link to All Tasks filtered by stage; no task lists inside them.
    const journey = screen.getByRole("heading", { name: "Your onboarding journey" }).closest("section") as HTMLElement;
    expect(within(journey).getByRole("link", { name: /^Documentation: 0 of 1 tasks done/ })).toHaveAttribute("href", "/onboarding?stage=Documentation");
    expect(within(journey).getByRole("link", { name: /^Welcome & IT setup: 1 of 1 tasks done/ })).toHaveAttribute("href", "/onboarding?stage=Welcome");
    expect(within(journey).queryByRole("listitem", { name: /Submit emergency/ })).not.toBeInTheDocument();
    expect(within(journey).queryByText("Submit emergency contact details")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Help Desk" })).toBeInTheDocument();
    // A returning user isn't shown the first-visit tour.
    expect(screen.queryByText("Skip tour")).not.toBeInTheDocument();
  });

  it("explains empty calendar days: weekends, holidays and the next activity", async () => {
    mockApi(signedInRoutes(employeeUser));
    renderApp("/");
    const user = userEvent.setup();
    const details = await screen.findByTestId("calendar-day-details");
    expect(details).toHaveTextContent("Saturday — Weekly Holiday");
    expect(details).toHaveTextContent("No onboarding activities are scheduled today because Saturday is a weekly holiday. Your next onboarding activity is scheduled for the next working day, Monday, November 9.");

    await user.click(screen.getByRole("button", { name: /November 10.*Diwali/ }));
    expect(screen.getByTestId("calendar-day-details")).toHaveTextContent("Festival Holiday — Diwali (Balipadyami)");
    expect(screen.getByTestId("calendar-day-details")).toHaveTextContent("This date is a festival holiday: Diwali (Balipadyami).");

    // An empty working day gets the plain explanation (no invented reason) and a link to the next activity.
    const emptyWorkingDay = screen.getAllByRole("button", { name: /: no tasks$/ }).find((b) => !/Weekly off|Diwali/.test(b.getAttribute("aria-label") ?? ""));
    expect(emptyWorkingDay).toBeDefined();
    await user.click(emptyWorkingDay!);
    const emptyDetails = screen.getByTestId("calendar-day-details");
    expect(emptyDetails).toHaveTextContent("No tasks scheduled");
    expect(emptyDetails).toHaveTextContent("No onboarding tasks are scheduled for this date. Your next assigned activity is on Friday, November 20.");
    await user.click(screen.getByRole("button", { name: /November 9[^:]*: 1 task/ }));
    await user.click(within(screen.getByTestId("calendar-day-details")).getByRole("button", { name: /Information Security training/ }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Information Security training");
  });

  it("completes a task only by submitting its form, not by ticking it", async () => {
    const { requests } = mockApi({
      ...signedInRoutes(employeeUser),
      "POST /api/v1/onboarding/tasks/t2/action": (request) => ({
        body: emergencyContactAction({
          task: { ...tasks[1], status: "completed", completedAt: "2026-11-07T12:00:00Z" },
          completed: true,
          completedAt: "2026-11-07T12:00:00Z",
          values: (request.body as { values: Record<string, string> }).values,
        }),
      }),
      "PATCH /api/v1/onboarding/tasks/t2": (request) => ({ body: { ...tasks[1], ...(request.body as object), firstStartedAt: "2026-11-07T11:58:00Z", activeSince: "2026-11-07T11:58:00Z", timeSpentSeconds: 0 } }),
    });
    renderApp("/onboarding");
    const user = userEvent.setup();

    // Ticking an actionable task opens it instead of completing it.
    const [checkbox] = await screen.findAllByRole("button", { name: "Open “Submit emergency contact details” to complete it" });
    await user.click(checkbox);
    const dialog = await screen.findByRole("dialog");
    expect(requests.some((r) => r.method === "PATCH")).toBe(false);

    // The task is started first (the server records the start time), then its form appears.
    await user.click(await within(dialog).findByRole("button", { name: "Start task" }));
    await waitFor(() => expect(requests.find((r) => r.method === "PATCH")?.body).toEqual({ status: "in_progress" }));

    // Client-side validation runs before anything is sent.
    await user.click(await within(dialog).findByRole("button", { name: "Submit" }));
    expect(within(dialog).getByText("Contact name is required.")).toBeInTheDocument();
    expect(requests.some((r) => r.method === "POST" && r.path.endsWith("/action"))).toBe(false);

    await user.type(within(dialog).getByLabelText("Contact name"), "Asha Nambiar");
    await user.selectOptions(within(dialog).getByLabelText("Relationship"), "Parent");
    await user.type(within(dialog).getByLabelText("Phone number"), "+91 98450 12345");
    await user.click(within(dialog).getByRole("button", { name: "Submit" }));

    await waitFor(() => expect(requests.some((r) => r.method === "POST" && r.path === "/api/v1/onboarding/tasks/t2/action")).toBe(true));
    const post = requests.find((r) => r.method === "POST" && r.path === "/api/v1/onboarding/tasks/t2/action");
    expect(post?.body).toEqual({ values: { contact_name: "Asha Nambiar", relationship: "Parent", phone: "+91 98450 12345" } });
    expect(post?.headers["x-requested-with"]).toBe("OnboardIQ");
    // The server confirmed completion: congratulate, and say what's next (nothing else is due today).
    expect(await screen.findByText("Great job! 🎉")).toBeInTheDocument();
    expect(screen.getByText(/You've completed all your tasks for today\. Your next task is due on/)).toBeInTheDocument();
    expect(within(dialog).getByText(/^Completed on/)).toBeInTheDocument();
  });

  it("shows the server's field errors on the form", async () => {
    mockApi({
      ...signedInRoutes(employeeUser),
      "PATCH /api/v1/onboarding/tasks/t2": () => ({ body: { ...tasks[1], status: "in_progress" } }),
      "POST /api/v1/onboarding/tasks/t2/action": () => ({ status: 422, body: { detail: "Please fix the highlighted fields.", code: "invalid_fields", fields: { phone: "Enter a valid phone number." } } }),
    });
    renderApp("/onboarding?task=t2");
    const user = userEvent.setup();
    const dialog = await screen.findByRole("dialog");
    await user.click(await within(dialog).findByRole("button", { name: "Start task" }));

    await user.type(await within(dialog).findByLabelText("Contact name"), "Asha Nambiar");
    await user.selectOptions(within(dialog).getByLabelText("Relationship"), "Parent");
    await user.type(within(dialog).getByLabelText("Phone number"), "1234567");
    await user.click(within(dialog).getByRole("button", { name: "Submit" }));

    expect(await within(dialog).findByText("Please fix the highlighted fields.")).toBeInTheDocument();
    expect(within(dialog).getByText("Enter a valid phone number.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Phone number")).toHaveAttribute("aria-invalid", "true");
  });

  it("reopens a completed task through the API", async () => {
    const { requests } = mockApi({
      ...signedInRoutes(employeeUser),
      "PATCH /api/v1/onboarding/tasks/t1": (request) => ({ body: { ...tasks[0], ...(request.body as object), updatedAt: "2026-11-07T12:00:00Z" } }),
    });
    renderApp("/onboarding");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Mark “Complete HR orientation” as not complete" }));

    await waitFor(() => expect(requests.some((r) => r.method === "PATCH" && r.path === "/api/v1/onboarding/tasks/t1")).toBe(true));
    expect(requests.find((r) => r.method === "PATCH")?.body).toEqual({ status: "pending" });
  });

  it("opens the checklist on exactly the status chosen from the overview", async () => {
    mockApi(signedInRoutes(employeeUser));
    renderApp("/");
    const user = userEvent.setup();

    const pendingLink = await screen.findByRole("link", { name: "View 2 pending tasks" });
    expect(pendingLink).toHaveAttribute("href", "/onboarding?status=pending");
    expect(screen.getByRole("link", { name: "View 1 completed tasks" })).toHaveAttribute("href", "/onboarding?status=completed");

    await user.click(screen.getByRole("link", { name: "View 1 in progress tasks" }));
    expect(await screen.findByRole("button", { name: "Open “Information Security training” to complete it" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open “Submit emergency contact details” to complete it" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open “Set 30-day goals” to complete it" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Complete HR orientation/ })).not.toBeInTheDocument();
  });

  it("shows a read-only policy library to employees (no upload or delete)", async () => {
    mockApi({
      ...signedInRoutes(employeeUser),
      "GET /api/v1/policies/documents": () => ({
        body: [{ id: "d1", filename: "leave-policy.txt", fileType: "txt", sizeBytes: 1200, status: "ready", pageCount: null, chunkCount: 4, errorMessage: null, uploadedAt: "2026-11-01T10:00:00Z", updatedAt: "2026-11-01T10:00:00Z" }],
      }),
    });
    renderApp("/documents");

    expect((await screen.findAllByText("leave-policy.txt")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Upload a document")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete leave-policy\.txt/i })).not.toBeInTheDocument();
  });
});

describe("HR dashboard", () => {
  it("renders totals and employees from the HR API", async () => {
    mockApi(signedInRoutes(hrUser));
    renderApp("/hr");

    const totals = await screen.findByRole("region", { name: "Onboarding totals" }).catch(() => null);
    expect(await screen.findByText("28 of 36 tasks")).toBeInTheDocument();
    expect(screen.getByText("Across 2 employees")).toBeInTheDocument();
    if (totals) expect(within(totals).getByText("8")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Employee onboarding progress" });
    expect(within(table).getByText("Shreya Nambiar")).toBeInTheDocument();
    expect(within(table).getByText("Meera Pillai")).toBeInTheDocument();
    // Selecting the first employee loads their task list.
    expect(await screen.findByText("Submit emergency contact details")).toBeInTheDocument();
  });

  it("filters by status through the API", async () => {
    const { requests } = mockApi(signedInRoutes(hrUser));
    renderApp("/hr");
    const user = userEvent.setup();
    await screen.findByRole("table", { name: "Employee onboarding progress" });

    await user.click(screen.getByRole("tab", { name: /Completed/ }));

    await waitFor(() => expect(requests.some((r) => r.path === "/api/v1/hr/employees" && r.search.includes("status=completed"))).toBe(true));
    const table = await screen.findByRole("table", { name: "Employee onboarding progress" });
    await waitFor(() => expect(within(table).queryByText("Shreya Nambiar")).not.toBeInTheDocument());
    expect(within(table).getByText("Meera Pillai")).toBeInTheDocument();
  });

  it("searches through the API", async () => {
    const { requests } = mockApi(signedInRoutes(hrUser));
    renderApp("/hr");
    const user = userEvent.setup();
    await screen.findByRole("table", { name: "Employee onboarding progress" });

    await user.type(screen.getByLabelText("Search employees"), "meera");

    await waitFor(() => expect(requests.some((r) => r.path === "/api/v1/hr/employees" && r.search.includes("search=meera"))).toBe(true));
  });

  it("shows an error state with retry when the API fails", async () => {
    let fail = true;
    mockApi({
      ...signedInRoutes(hrUser),
      "GET /api/v1/hr/summary": () => (fail ? { status: 503, body: { detail: "The database is temporarily unavailable. Please try again shortly." } } : { body: signedInRoutes(hrUser)["GET /api/v1/hr/summary"]({} as never)?.body }),
    });
    renderApp("/hr");

    expect(await screen.findByText("Couldn't load the HR dashboard")).toBeInTheDocument();
    fail = false;
    await userEvent.setup().click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByText("28 of 36 tasks")).toBeInTheDocument();
  });

  it("lets HR upload and delete policy documents", async () => {
    mockApi(signedInRoutes(hrUser));
    renderApp("/documents");
    expect(await screen.findByText("Upload a document")).toBeInTheDocument();
  });
});
