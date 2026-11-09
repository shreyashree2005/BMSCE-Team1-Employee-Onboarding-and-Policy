import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Eye, FileCheck2, FileText, FileUp, Lock, RefreshCw, Send } from "lucide-react";
import { useOnboarding } from "../../context/OnboardingContext";
import { useToast } from "../../context/ToastContext";
import { ApiError } from "../../services/apiClient";
import { fetchTaskAction, fetchTaskDocumentFile, submitTaskAction, uploadTaskDocument } from "../../services/taskActionsApi";
import type { OnboardingTask } from "../../types/dashboard";
import type { DocumentRequirement, TaskActionState } from "../../types/taskActions";
import { formatBytes, formatDate } from "../../utils/format";
import { getBlockingTasks } from "../../utils/onboarding";
import { Button } from "../ui/Button";
import { ErrorState } from "../ui/ErrorState";
import { SectionHeader } from "../ui/SectionHeader";
import { Skeleton } from "../ui/Skeleton";
import { StatusPill } from "../ui/StatusPill";

/** Same rules as the server (which also checks the file's real type from its content). */
export const DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED_NAME = /\.(pdf|jpe?g|png)$/i;
const ACCEPT_ATTR = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

export function documentFileError(file: File): string | null {
  if (!ACCEPTED_NAME.test(file.name)) return "Choose a PDF, JPG or PNG file.";
  if (file.size === 0) return "The file is empty.";
  if (file.size > DOCUMENT_MAX_BYTES) return "Files can be at most 5 MB.";
  return null;
}

const typeLabel = (contentType: string) => (contentType === "application/pdf" ? "PDF" : contentType === "image/png" ? "PNG" : contentType === "image/jpeg" ? "JPG" : "File");

type Loaded = { state: TaskActionState } | { error: string } | undefined;

/**
 * Home page card for the employee's required onboarding documents. It works on the same records as the document
 * tasks (upload, replace, view, download, submit), through the same API, so the checklist and progress stay in sync.
 * Files are stored per employee on the server and only the signed-in employee can reach them.
 */
export function DocumentsSection() {
  const { tasks, applyTask, celebrate } = useOnboarding();
  const documentTasks = tasks.filter((task) => task.actionType === "document_upload");
  const [loaded, setLoaded] = useState<Record<string, Loaded>>({});
  const [reloadKey, setReloadKey] = useState(0);
  // Reload a task's documents when its status changes elsewhere (e.g. submitted from All Tasks).
  const statusKey = documentTasks.map((t) => `${t.id}:${t.status}`).join("|");

  useEffect(() => {
    const controller = new AbortController();
    for (const task of documentTasks) {
      fetchTaskAction(task.id, controller.signal)
        .then((state) => setLoaded((prev) => ({ ...prev, [task.id]: { state } })))
        .catch((caught: unknown) => {
          if (!controller.signal.aborted) setLoaded((prev) => ({ ...prev, [task.id]: { error: caught instanceof ApiError ? caught.message : "Your documents couldn't be loaded." } }));
        });
    }
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when a document task's status changes
  }, [statusKey, reloadKey]);

  const onStateChange = useCallback(
    (task: OnboardingTask, next: TaskActionState, wasCompleted: boolean) => {
      setLoaded((prev) => ({ ...prev, [task.id]: { state: next } }));
      applyTask(next.task);
      if (next.completed && !wasCompleted) celebrate(next.task);
    },
    [applyTask, celebrate],
  );

  if (documentTasks.length === 0) return null;

  const states = documentTasks.map((t) => loaded[t.id]).filter((l): l is { state: TaskActionState } => Boolean(l && "state" in l));
  const required = states.reduce((n, l) => n + l.state.documents.length, 0);
  const uploaded = states.reduce((n, l) => n + l.state.documents.filter((d) => d.uploaded).length, 0);

  return (
    <section aria-labelledby="documents-heading" className="rounded-panel border border-line bg-white p-5 shadow-card sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <SectionHeader id="documents-heading" title="Upload Documents" description="Your required onboarding documents. PDF, JPG or PNG, up to 5 MB each." />
        {states.length === documentTasks.length && required > 0 && (
          <p className="shrink-0 text-[12.5px] font-medium text-slate-500" data-testid="documents-summary">
            <span className="font-semibold text-navy-900 tabular-nums">{uploaded}</span> of <span className="tabular-nums">{required}</span> uploaded
          </p>
        )}
      </div>
      <div className="mt-5 space-y-5">
        {documentTasks.map((task) => (
          <DocumentTaskGroup
            key={task.id}
            task={task}
            loaded={loaded[task.id]}
            allTasks={tasks}
            showCount={documentTasks.length > 1}
            onRetry={() => setReloadKey((k) => k + 1)}
            onStateChange={onStateChange}
          />
        ))}
      </div>
    </section>
  );
}

function DocumentTaskGroup({
  task,
  loaded,
  allTasks,
  showCount,
  onRetry,
  onStateChange,
}: {
  task: OnboardingTask;
  loaded: Loaded;
  allTasks: OnboardingTask[];
  /** Per-task count; left out when this is the only document task (the card's header already shows it). */
  showCount: boolean;
  onRetry: () => void;
  onStateChange: (task: OnboardingTask, next: TaskActionState, wasCompleted: boolean) => void;
}) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const blocking = task.status === "completed" ? [] : getBlockingTasks(task, allTasks);
  const locked = blocking.length > 0;
  const headingId = `documents-${task.id}`;

  if (!loaded) {
    return (
      <div className="space-y-2" aria-label={`Loading ${task.title}`}>
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }
  if ("error" in loaded) {
    return (
      <div className="rounded-lg border border-line">
        <ErrorState title={`Couldn't load “${task.title}”`} message={loaded.error} onRetry={onRetry} />
      </div>
    );
  }
  const { state } = loaded;
  const submitted = state.completed;
  const allUploaded = state.documents.every((d) => d.uploaded);

  const run = async (key: string, operation: () => Promise<TaskActionState>) => {
    setBusy(key);
    setErrors((prev) => ({ ...prev, [key]: "" }));
    try {
      const next = await operation();
      onStateChange(task, next, submitted);
      if (next.message && !(next.completed && !submitted)) showToast(next.message);
    } catch (caught) {
      setErrors((prev) => ({ ...prev, [key]: caught instanceof ApiError ? caught.message : "Something went wrong. Please try again." }));
    } finally {
      setBusy(null);
    }
  };

  const upload = (doc: DocumentRequirement, file: File) => {
    const problem = documentFileError(file);
    if (problem) {
      setErrors((prev) => ({ ...prev, [doc.id]: problem }));
      return;
    }
    void run(doc.id, () => uploadTaskDocument(task.id, doc.id, file));
  };

  return (
    <div role="group" aria-labelledby={headingId}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 id={headingId} className="text-[13.5px] font-semibold text-primary-700">
          {task.title}
        </h3>
        {submitted ? (
          <StatusPill tone="green" size="sm">
            Submitted
          </StatusPill>
        ) : locked ? (
          <StatusPill tone="neutral" size="sm">
            Locked
          </StatusPill>
        ) : null}
        {locked && (
          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-amber-700">
            <Lock size={11} aria-hidden="true" />
            After {blocking.map((t) => t.title).join(", ")}
          </span>
        )}
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
        {state.documents.map((doc) => (
          <DocumentRow
            key={doc.id}
            taskId={task.id}
            doc={doc}
            submitted={submitted}
            locked={locked}
            busy={busy === doc.id}
            disabled={busy !== null}
            error={errors[doc.id]}
            onFile={(file) => upload(doc, file)}
          />
        ))}
      </ul>
      {!submitted && (allUploaded || showCount) && (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] text-slate-500">
            {allUploaded ? "Every document is uploaded. Submit them to complete this task." : `${state.documents.filter((d) => d.uploaded).length} of ${state.documents.length} uploaded`}
          </p>
          {allUploaded && (
            <Button size="sm" disabled={busy !== null || locked} onClick={() => void run("submit", () => submitTaskAction(task.id, { complete: true }))}>
              <Send size={13} aria-hidden="true" />
              Submit documents
            </Button>
          )}
        </div>
      )}
      {errors.submit && (
        <p role="alert" className="mt-1.5 text-[12px] text-rose-600">
          {errors.submit}
        </p>
      )}
      {submitted && <p className="mt-2 text-[12px] text-slate-500">Submitted for review. To change a document, reopen the task from All Tasks.</p>}
    </div>
  );
}

function DocumentRow({
  taskId,
  doc,
  submitted,
  locked,
  busy,
  disabled,
  error,
  onFile,
}: {
  taskId: string;
  doc: DocumentRequirement;
  submitted: boolean;
  locked: boolean;
  busy: boolean;
  disabled: boolean;
  error?: string;
  onFile: (file: File) => void;
}) {
  const { showToast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const file = doc.uploaded;

  const openFile = async (mode: "view" | "download") => {
    if (!file) return;
    try {
      const url = URL.createObjectURL(await fetchTaskDocumentFile(taskId, file.id));
      if (mode === "view") {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.download = file.filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (caught) {
      showToast(caught instanceof ApiError ? caught.message : "The file couldn't be opened.", "error");
    }
  };

  return (
    <li className="bg-white px-3.5 py-3 transition-colors hover:bg-primary-50/30 sm:px-4" data-testid={`document-${doc.id}`}>
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${file ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-400"}`} aria-hidden="true">
          {file ? <FileCheck2 size={17} /> : <FileText size={17} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-navy-900">
            {doc.label}
            {submitted && file ? (
              <StatusPill tone="green" size="sm">
                Submitted
              </StatusPill>
            ) : file ? (
              <StatusPill tone="blue" size="sm">
                Uploaded
              </StatusPill>
            ) : (
              <StatusPill tone="neutral" size="sm">
                Not uploaded
              </StatusPill>
            )}
          </p>
          {file ? (
            <p className="mt-0.5 truncate text-[12px] text-slate-600" title={file.filename}>
              {file.filename} · {typeLabel(file.contentType)} · {formatBytes(file.sizeBytes)} · {formatDate(file.uploadedAt)}
            </p>
          ) : (
            <p className="mt-0.5 text-[12px] text-slate-500">{doc.hint}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {file && (
            <>
              <Button size="sm" variant="ghost" onClick={() => void openFile("view")} aria-label={`View ${doc.label}`}>
                <Eye size={14} aria-hidden="true" />
                View
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void openFile("download")} aria-label={`Download ${doc.label}`}>
                <Download size={14} aria-hidden="true" />
                Download
              </Button>
            </>
          )}
          {!submitted && (
            <>
              <input
                ref={input}
                type="file"
                accept={ACCEPT_ATTR}
                className="sr-only"
                tabIndex={-1}
                aria-label={`Choose a file for ${doc.label}`}
                disabled={disabled || locked}
                onChange={(e) => {
                  const chosen = e.target.files?.[0];
                  e.target.value = "";
                  if (chosen) onFile(chosen);
                }}
              />
              <Button size="sm" variant="secondary" disabled={disabled || locked} onClick={() => input.current?.click()} aria-label={`${file ? "Replace" : "Upload"} ${doc.label}`}>
                {busy ? <RefreshCw size={14} className="animate-spin" aria-hidden="true" /> : <FileUp size={14} aria-hidden="true" />}
                {busy ? "Uploading…" : file ? "Replace" : "Upload"}
              </Button>
            </>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-[12px] text-rose-600">
          {error}
        </p>
      )}
    </li>
  );
}
