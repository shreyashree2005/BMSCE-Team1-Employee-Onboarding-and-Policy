/** Home page "Upload Documents" card (MOCKED API; documents and people are fictional). */
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OnboardingTask } from "../src/types/dashboard";
import type { TaskActionState } from "../src/types/taskActions";
import { emergencyContactAction, employeeUser, mockApi, renderApp, signedInRoutes, tasks } from "./helpers";

const docTask: OnboardingTask = {
  ...tasks[0], id: "d1", title: "Upload required documents", stage: "Documentation", category: "Documents", status: "pending",
  priority: "high", dueDate: "2026-11-08", actionType: "document_upload", dependsOn: [],
}; // fmt: skip
const uploaded = { id: 41, filename: "passport.pdf", contentType: "application/pdf", sizeBytes: 182_000, uploadedAt: "2026-11-07T09:30:00Z" };

function docState(overrides: Partial<TaskActionState> = {}, idProof: typeof uploaded | null = null): TaskActionState {
  return emergencyContactAction({
    task: docTask, actionType: "document_upload", kind: null, instructions: "Upload each document.", fields: [],
    documents: [
      { id: "id_proof", label: "Government photo ID", hint: "Passport, national ID card or driving licence.", uploaded: idProof },
      { id: "address_proof", label: "Proof of address", hint: "Utility bill from the last 3 months.", uploaded: null },
    ],
    ...overrides,
  }); // fmt: skip
}

function file(name: string, size: number, type: string): File {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

function setup(state: () => TaskActionState, extra: Record<string, (request: never) => { status?: number; body?: unknown; raw?: Response }> = {}, taskList = [docTask, ...tasks.slice(1)]) {
  return mockApi({
    ...signedInRoutes(employeeUser),
    "GET /api/v1/onboarding/tasks": () => ({ body: taskList }),
    "GET /api/v1/onboarding/tasks/d1/action": () => ({ body: state() }),
    ...extra,
  });
}

const card = async () => (await screen.findByRole("heading", { name: "Upload Documents" })).closest("section") as HTMLElement;
const choose = (label: string, chosen: File) => fireEvent.change(screen.getByLabelText(`Choose a file for ${label}`), { target: { files: [chosen] } });

describe("Home: Upload Documents", () => {
  beforeEach(() => {
    vi.stubGlobal("open", vi.fn());
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:doc"), revokeObjectURL: vi.fn() });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("lists each required document with its type and upload status", async () => {
    setup(() => docState({}, uploaded));
    renderApp("/");
    const section = await card();
    const id = await within(section).findByTestId("document-id_proof");
    expect(within(id).getByText("Government photo ID")).toBeInTheDocument();
    expect(within(id).getByText("Uploaded")).toBeInTheDocument();
    expect(within(id).getByText(/passport\.pdf · PDF · 178 KB/)).toBeInTheDocument();
    expect(within(id).getByRole("button", { name: "Replace Government photo ID" })).toBeInTheDocument();
    const address = within(section).getByTestId("document-address_proof");
    expect(within(address).getByText("Not uploaded")).toBeInTheDocument();
    expect(within(address).getByText(/Utility bill/)).toBeInTheDocument();
    expect(within(section).getByTestId("documents-summary")).toHaveTextContent("1 of 2 uploaded");
  });

  it("uploads through the existing task API and updates the status and the task", async () => {
    let current = docState();
    const { requests } = setup(() => current, {
      "POST /api/v1/onboarding/tasks/d1/documents": () => {
        current = docState({ task: { ...docTask, status: "in_progress" }, message: "Government photo ID uploaded." }, { ...uploaded, filename: "id-card.png", contentType: "image/png" });
        return { status: 201, body: current };
      },
    });
    renderApp("/");
    await within(await card()).findByTestId("document-id_proof");
    choose("Government photo ID", file("id-card.png", 50_000, "image/png"));

    expect(await screen.findByText("Government photo ID uploaded.")).toBeInTheDocument();
    const row = screen.getByTestId("document-id_proof");
    expect(within(row).getByText("Uploaded")).toBeInTheDocument();
    expect(within(row).getByText(/id-card\.png · PNG/)).toBeInTheDocument();
    const sent = requests.find((r) => r.method === "POST" && r.path === "/api/v1/onboarding/tasks/d1/documents");
    expect(sent?.body).toBeInstanceOf(FormData);
    expect((sent?.body as FormData).get("documentType")).toBe("id_proof");
    expect(((sent?.body as FormData).get("file") as File).name).toBe("id-card.png");
  });

  it("rejects the wrong file type or a file over 5 MB without uploading", async () => {
    const { requests } = setup(() => docState());
    renderApp("/");
    await within(await card()).findByTestId("document-id_proof");

    choose("Government photo ID", file("notes.docx", 1000, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"));
    expect(await within(screen.getByTestId("document-id_proof")).findByRole("alert")).toHaveTextContent("Choose a PDF, JPG or PNG file.");
    choose("Government photo ID", file("big.pdf", 5 * 1024 * 1024 + 1, "application/pdf"));
    expect(await within(screen.getByTestId("document-id_proof")).findByRole("alert")).toHaveTextContent("Files can be at most 5 MB.");
    expect(requests.some((r) => r.method === "POST")).toBe(false);
  });

  it("shows the server's error when an upload is refused", async () => {
    setup(() => docState(), {
      "POST /api/v1/onboarding/tasks/d1/documents": () => ({ status: 415, body: { detail: "Upload a PDF, JPG or PNG file.", code: "unsupported_file_type" } }),
    });
    renderApp("/");
    await within(await card()).findByTestId("document-id_proof");
    choose("Government photo ID", file("scan.pdf", 1000, "application/pdf"));
    expect(await within(screen.getByTestId("document-id_proof")).findByRole("alert")).toHaveTextContent("Upload a PDF, JPG or PNG file.");
    expect(within(screen.getByTestId("document-id_proof")).getByText("Not uploaded")).toBeInTheDocument();
  });

  it("views and downloads the employee's own file", async () => {
    const { requests } = setup(() => docState({}, uploaded), {
      "GET /api/v1/onboarding/tasks/d1/documents/41/file": () => ({ raw: new Response(new Blob(["%PDF-"], { type: "application/pdf" }), { status: 200 }) }),
    });
    renderApp("/");
    const user = userEvent.setup();
    const row = await within(await card()).findByTestId("document-id_proof");
    await user.click(within(row).getByRole("button", { name: "View Government photo ID" }));
    await waitFor(() => expect(window.open).toHaveBeenCalledWith("blob:doc", "_blank", "noopener,noreferrer"));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    await user.click(within(row).getByRole("button", { name: "Download Government photo ID" }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(requests.filter((r) => r.path === "/api/v1/onboarding/tasks/d1/documents/41/file")).toHaveLength(2);
  });

  it("offers Submit once everything is uploaded, and shows Submitted afterwards with no replace", async () => {
    const both = { ...docState({}, uploaded) };
    both.documents = both.documents.map((d) => ({ ...d, uploaded: { ...uploaded, id: d.id === "id_proof" ? 41 : 42 } }));
    let current = both;
    const { requests } = setup(() => current, {
      "POST /api/v1/onboarding/tasks/d1/action": () => {
        current = { ...both, completed: true, completedAt: "2026-11-07T10:00:00Z", task: { ...docTask, status: "completed" } };
        return { body: current };
      },
    });
    renderApp("/");
    const user = userEvent.setup();
    const section = await card();
    await user.click(await within(section).findByRole("button", { name: /Submit documents/ }));
    await waitFor(() => expect(requests.find((r) => r.method === "POST" && r.path.endsWith("/action"))?.body).toEqual({ complete: true }));
    expect(await within(section).findAllByText("Submitted")).not.toHaveLength(0);
    expect(within(section).queryByRole("button", { name: /Replace/ })).not.toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "View Government photo ID" })).toBeInTheDocument();
  });

  it("locks uploads until the prerequisite task is done", async () => {
    const locked = { ...docTask, dependsOn: [tasks[1].id] };
    setup(() => docState({ task: locked }), {}, [locked, ...tasks.slice(1)]);
    renderApp("/");
    const section = await card();
    expect(await within(section).findByText("Locked")).toBeInTheDocument();
    expect(within(section).getByText(new RegExp(`After ${tasks[1].title}`))).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Upload Government photo ID" })).toBeDisabled();
  });

  it("isn't shown when the employee has no document tasks", async () => {
    setup(() => docState(), {}, tasks);
    renderApp("/");
    await screen.findByRole("heading", { name: "Your Next Step" });
    expect(screen.queryByRole("heading", { name: "Upload Documents" })).not.toBeInTheDocument();
  });
});
