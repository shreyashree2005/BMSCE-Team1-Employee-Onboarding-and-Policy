import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { AuthUser } from "../src/types/auth";
import type { Ticket } from "../src/types/helpdesk";
import type { PolicyQuiz, PolicyQuizResult } from "../src/types/policyQuiz";
import { PolicyQuizDialog } from "../src/components/quiz/PolicyQuizDialog";
import { ToastProvider } from "../src/context/ToastContext";
import { employeeUser, hrUser, mockApi, renderApp, signedInRoutes, tasks } from "./helpers";

const firstTimer: AuthUser = { ...employeeUser, tourCompleted: false, companyIntroSeen: false };

describe("first-visit guidance", () => {
  it("walks a first-time employee through the tour, then offers the company introduction", async () => {
    const { requests } = mockApi(signedInRoutes(firstTimer));
    renderApp("/");
    const user = userEvent.setup();

    const tour = await screen.findByRole("dialog", { name: "Welcome to Dayforce, Shreya!" });
    expect(within(tour).getByText("Step 1 of 7")).toBeInTheDocument();
    expect(within(tour).queryByRole("button", { name: /Back/ })).not.toBeInTheDocument();
    await user.click(within(tour).getByRole("button", { name: /Next/ }));
    expect(await screen.findByRole("dialog", { name: "Your onboarding tasks" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Back/ }));
    expect(await screen.findByRole("dialog", { name: "Welcome to Dayforce, Shreya!" })).toBeInTheDocument();
    for (let i = 0; i < 6; i++) await user.click(screen.getByRole("button", { name: /Next/ }));
    expect(screen.getByRole("dialog", { name: "Track your progress" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Get started/ }));

    await waitFor(() => expect(requests.find((r) => r.method === "PATCH")?.body).toEqual({ tourCompleted: true }));
    // Then the company introduction, with a video that only loads when played.
    const intro = await screen.findByRole("dialog", { name: "Welcome to Dayforce!" });
    expect(within(intro).queryByTitle(/Do the Work You're Meant to Do/)).not.toBeInTheDocument();
    await user.click(within(intro).getByRole("button", { name: /Play video/ }));
    const frame = within(intro).getByTitle("Dayforce: Do the Work You're Meant to Do");
    expect(frame).toHaveAttribute("src", expect.stringContaining("youtube-nocookie.com/embed/4-JGpxcI0aI"));
    await user.click(within(intro).getByRole("button", { name: "Continue to onboarding" }));
    await waitFor(() => expect(requests.filter((r) => r.method === "PATCH").map((r) => r.body)).toContainEqual({ companyIntroSeen: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("skipping the tour without 'Don't show this again' doesn't save anything; with it, it's remembered", async () => {
    const { requests } = mockApi(signedInRoutes(firstTimer));
    renderApp("/");
    const user = userEvent.setup();
    await screen.findByRole("dialog", { name: "Welcome to Dayforce, Shreya!" });
    await user.click(screen.getByRole("checkbox", { name: "Don't show this again" }));
    await user.click(screen.getByRole("button", { name: "Skip tour" }));
    await waitFor(() => expect(requests.find((r) => r.method === "PATCH")?.body).toEqual({ tourCompleted: true }));

    // The busy employee skips the video straight away.
    const intro = await screen.findByRole("dialog", { name: "Welcome to Dayforce!" });
    await user.click(within(intro).getByRole("button", { name: "Skip video" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your Next Step" })).toBeInTheDocument(); // free to explore
  });

  it("falls back to the official channel when the video can't load", async () => {
    mockApi(signedInRoutes({ ...employeeUser, companyIntroSeen: false }));
    renderApp("/");
    const intro = await screen.findByRole("dialog", { name: "Welcome to Dayforce!" });
    fireEvent.error(intro.querySelector("img") as HTMLImageElement);
    expect(within(intro).getByRole("link", { name: /official Dayforce YouTube channel/ })).toHaveAttribute("href", "https://www.youtube.com/@Dayforce");
  });

  it("can be replayed from Settings", async () => {
    mockApi(signedInRoutes(employeeUser));
    renderApp("/settings");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Replay website tour/ }));
    expect(await screen.findByRole("dialog", { name: "Welcome to Dayforce, Shreya!" })).toBeInTheDocument();
  });
});

describe("profile photo and menu", () => {
  it("shows a default avatar, then the uploaded photo, with the profile menu", async () => {
    const withPhoto = { ...employeeUser, photoUrl: "/api/v1/auth/me/photo?v=1" };
    const { requests } = mockApi({ ...signedInRoutes(employeeUser), "POST /api/v1/auth/me/photo": () => ({ body: withPhoto }) });
    renderApp("/profile");
    const user = userEvent.setup({ applyAccept: false }); // let the component's own type check run

    await user.click(await screen.findByRole("button", { name: "Open profile menu" }));
    const menu = screen.getByRole("button", { name: "My Profile" }).closest("div") as HTMLElement;
    expect(menu).toBeTruthy();
    expect(screen.getAllByText("Software Developer").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Logout" })).toBeInTheDocument();
    await user.keyboard("{Escape}");

    const input = screen.getByLabelText("Upload photo");
    await user.upload(input, new File(["x"], "photo.gif", { type: "image/gif" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a JPG or PNG image.");
    expect(requests.some((r) => r.path === "/api/v1/auth/me/photo")).toBe(false);

    await user.upload(input, new File(["png"], "photo.png", { type: "image/png" }));
    await waitFor(() => expect(requests.some((r) => r.method === "POST" && r.path === "/api/v1/auth/me/photo")).toBe(true));
    expect(await screen.findByText("Your profile photo was updated.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Replace photo/ })).toBeInTheDocument();
  });
});

describe("Help Desk", () => {
  const ticket: Ticket = {
    id: 7, reference: "HD-000007", category: "document_upload", categoryLabel: "Document Upload Issues", subject: "Upload keeps failing",
    description: "My address proof upload fails.", status: "open", attachment: null, createdAt: "2026-11-07T10:00:00Z",
    updatedAt: "2026-11-07T10:00:00Z", resolvedAt: null, requesterName: null, requesterEmail: null,
  }; // fmt: skip

  it("lets an employee raise a ticket and track it", async () => {
    const { requests } = mockApi({
      ...signedInRoutes(employeeUser),
      "GET /api/v1/helpdesk/tickets": () => ({ body: [] }),
      "POST /api/v1/helpdesk/tickets": () => ({ status: 201, body: ticket }),
    });
    renderApp("/help");
    const user = userEvent.setup();
    expect(await screen.findByText("No tickets yet")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Submit ticket/ }));
    expect(screen.getByText("Choose a category.")).toBeInTheDocument();
    expect(requests.some((r) => r.method === "POST")).toBe(false);

    await user.selectOptions(screen.getByLabelText("Category"), "document_upload");
    await user.type(screen.getByLabelText("Subject"), "Upload keeps failing");
    await user.type(screen.getByLabelText("Description"), "My address proof upload fails.");
    await user.click(screen.getByRole("button", { name: /Submit ticket/ }));

    const post = await waitFor(() => {
      const found = requests.find((r) => r.method === "POST" && r.path === "/api/v1/helpdesk/tickets");
      expect(found).toBeTruthy();
      return found!;
    });
    expect(post.body).toBeInstanceOf(FormData);
    expect((post.body as FormData).get("category")).toBe("document_upload");
    const list = await screen.findByRole("list", { name: "My tickets" });
    expect(within(list).getByText("HD-000007")).toBeInTheDocument();
    expect(within(list).getByText("Open")).toBeInTheDocument();
  });

  it("lets HR move a ticket through its statuses", async () => {
    const hrView = { ...ticket, requesterName: "Shreya Nambiar", requesterEmail: employeeUser.email };
    const { requests } = mockApi({
      ...signedInRoutes(hrUser),
      "GET /api/v1/helpdesk/admin/tickets": () => ({ body: [hrView] }),
      "GET /api/v1/helpdesk/admin/summary": () => ({ body: { total: 1, byStatus: { open: 1 } } }),
      "PATCH /api/v1/helpdesk/admin/tickets/7": (request) => ({ body: { ...hrView, ...(request.body as object) } }),
    });
    renderApp("/help");
    const user = userEvent.setup();
    const queue = await screen.findByRole("list", { name: "Ticket queue" });
    expect(within(queue).getByText(/Shreya Nambiar/)).toBeInTheDocument();
    // Status counts from the server's summary; statuses without tickets show 0.
    const summary = await screen.findByRole("group", { name: "Tickets by status" });
    expect(within(summary).getByRole("button", { name: "Open: 1" })).toBeInTheDocument();
    expect(within(summary).getByRole("button", { name: "Closed: 0" })).toBeInTheDocument();
    // Searching filters the loaded queue.
    await user.type(screen.getByLabelText("Search tickets"), "no such ticket");
    expect(await screen.findByText("No matching tickets")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await user.selectOptions(within(await screen.findByRole("list", { name: "Ticket queue" })).getByLabelText("Status of HD-000007"), "in_progress");
    await waitFor(() => expect(requests.find((r) => r.method === "PATCH")?.body).toEqual({ status: "in_progress" }));
    expect(await screen.findByText("HD-000007 is now In Progress.")).toBeInTheDocument();
    // The counts are refreshed after the change.
    await waitFor(() => expect(requests.filter((r) => r.path === "/api/v1/helpdesk/admin/summary").length).toBe(2));
  });
});

describe("policy understanding quiz", () => {
  const quiz: PolicyQuiz = {
    policyId: "OIQ-IT-SEC-006", title: "IT and Information Security Policy", questionCount: 3, passScore: 3, attempts: 0, bestScore: null,
    passed: false, documentId: "doc-1", passPercent: 80, history: [],
    questions: [
      { id: "q1", question: "Minimum password length?", options: ["8", "10", "12", "14"] },
      { id: "q2", question: "Report a lost laptop within?", options: ["1 hour", "1 day", "7 days", "Never"] },
      { id: "q3", question: "Salaries are classified as?", options: ["Public", "Internal", "Confidential", "Restricted"] },
    ],
  }; // fmt: skip
  const result = (score: number): PolicyQuizResult => ({
    policyId: quiz.policyId, title: quiz.title, score, total: 3, passScore: 3, passed: score === 3, completedTaskIds: [],
    message: score === 0 ? "Your Score: 0/3. You may want to read the policy again before attempting the quiz." : `Your Score: ${score}/3. You need 3/3 to pass. Review the policy, then retake the quiz.`,
    history: [{ id: 1, score, total: 3, passed: score === 3, createdAt: "2026-11-07T10:00:00Z" }],
    results: quiz.questions.map((q, i) => ({
      id: q.id, question: q.question, options: q.options, chosen: 0, correctOption: i < score ? 0 : 3, correct: i < score,
      feedback: i < score ? "Great! You understood this concept." : `The correct answer is: ${q.options[3]}.`, explanation: `Section ${i + 1} explains it.`,
    })),
  }); // fmt: skip

  it("is no longer offered on the Documents page (quizzes now follow Policy Assistant answers)", async () => {
    mockApi({ ...signedInRoutes(employeeUser), "GET /api/v1/policies/documents": () => ({ body: [] }) });
    renderApp("/documents");
    expect(await screen.findByRole("heading", { name: /documents/i, level: 1 })).toBeInTheDocument();
    expect(screen.queryByText(/Understanding Quizzes/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Take a Quick Understanding Quiz/ })).not.toBeInTheDocument();
  });

  it("the policy task's quiz dialog grades on the server, explains wrong answers and allows a retake", async () => {
    const { requests } = mockApi({
      ...signedInRoutes(employeeUser),
      "GET /api/v1/policies/quizzes/OIQ-IT-SEC-006": () => ({ body: quiz }),
      "POST /api/v1/policies/quizzes/OIQ-IT-SEC-006/attempts": () => ({ body: result(0) }),
    });
    render(
      <ToastProvider>
        <PolicyQuizDialog policyId="OIQ-IT-SEC-006" onClose={() => undefined} />
      </ToastProvider>,
    );
    const user = userEvent.setup();
    const dialog = await screen.findByRole("dialog", { name: /Quick understanding quiz/ });
    expect(await within(dialog).findByText("1. Minimum password length?")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Submit answers" })).toBeDisabled();
    for (const q of quiz.questions) await user.click(within(dialog).getAllByRole("radio", { name: q.options[0] })[0]);
    await user.click(within(dialog).getByRole("button", { name: "Submit answers" }));

    expect(await within(dialog).findByText("Your Score: 0/3")).toBeInTheDocument();
    expect(within(dialog).getByText("You may want to read the policy again before attempting the quiz.")).toBeInTheDocument();
    expect(within(dialog).getAllByText(/The correct answer is: 14\./).length).toBe(1);
    expect(within(dialog).getByText("Section 1 explains it.")).toBeInTheDocument();
    expect(requests.find((r) => r.method === "POST")?.body).toEqual({ answers: { q1: 0, q2: 0, q3: 0 } });

    await user.click(within(dialog).getByRole("button", { name: /Retake quiz/ }));
    expect(within(dialog).getByRole("button", { name: "Submit answers" })).toBeDisabled();
    expect(within(dialog).getByRole("list", { name: "Your attempts" })).toHaveTextContent("#1 · 0/3");
  });
});

describe("task dependencies in the UI", () => {
  it("locks a task until its prerequisite is complete", async () => {
    const locked = tasks.map((t) => (t.id === "t4" ? { ...t, dependsOn: ["t2"] } : t));
    mockApi({ ...signedInRoutes(employeeUser), "GET /api/v1/onboarding/tasks": () => ({ body: locked }), "GET /api/v1/onboarding/tasks/t4/action": () => ({ body: { task: locked[3], actionType: "form", kind: "goals", instructions: "Set goals.", completed: false, completedAt: null, message: null, fields: [], values: {}, maskedValues: {}, documents: [], items: [], policies: [], signature: null, sections: [], quiz: null } }) });
    renderApp("/onboarding?task=t4");
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(/This task unlocks after “Submit emergency contact details”/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /Locked/ })).toBeDisabled();
    expect(within(dialog).queryByRole("button", { name: "Start task" })).not.toBeInTheDocument();
  });
});
