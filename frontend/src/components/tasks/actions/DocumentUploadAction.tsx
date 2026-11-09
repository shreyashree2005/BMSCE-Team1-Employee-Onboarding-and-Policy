import { useRef, useState } from "react";
import { Eye, FileCheck2, FileUp, Trash2 } from "lucide-react";
import { useToast } from "../../../context/ToastContext";
import { ApiError } from "../../../services/apiClient";
import { fetchTaskDocumentFile } from "../../../services/taskActionsApi";
import { formatBytes } from "../../../utils/format";
import { Button } from "../../ui/Button";
import type { ActionControls } from "./TaskActionPanel";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = /\.(pdf|jpe?g|png)$/i;

interface DocumentUploadActionProps extends ActionControls {
  taskId: string;
  upload: (documentType: string, file: File) => Promise<boolean>;
  remove: (documentId: number) => Promise<boolean>;
}

/** One upload slot per required document; submit once every document is uploaded. */
export function DocumentUploadAction({ state, busy, taskId, upload, remove, submit }: DocumentUploadActionProps) {
  const { showToast } = useToast();
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const allUploaded = state.documents.every((d) => d.uploaded);

  const onFile = async (documentType: string, file: File | undefined) => {
    if (!file) return;
    const problem = !ACCEPTED.test(file.name) ? "Choose a PDF, JPG or PNG file." : file.size > MAX_BYTES ? "Files can be at most 5 MB." : file.size === 0 ? "The file is empty." : null;
    setLocalErrors((prev) => ({ ...prev, [documentType]: problem ?? "" }));
    if (!problem) await upload(documentType, file);
    const input = inputs.current[documentType];
    if (input) input.value = "";
  };

  const view = async (documentId: number) => {
    try {
      const blob = await fetchTaskDocumentFile(taskId, documentId);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (caught) {
      showToast(caught instanceof ApiError ? caught.message : "The file couldn't be opened.", "error");
    }
  };

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {state.documents.map((doc) => (
          <li key={doc.id} className="rounded-lg border border-line p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-navy-900">
                  {doc.uploaded ? <FileCheck2 size={15} className="text-emerald-600" aria-hidden="true" /> : <FileUp size={15} className="text-slate-400" aria-hidden="true" />}
                  {doc.label}
                </p>
                <p className="mt-0.5 text-[11.5px] text-slate-500">{doc.hint}</p>
                {doc.uploaded && (
                  <p className="mt-1 truncate text-xs text-slate-600">
                    {doc.uploaded.filename} · {formatBytes(doc.uploaded.sizeBytes)}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {doc.uploaded && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => void view(doc.uploaded!.id)} aria-label={`View ${doc.label}`}>
                      <Eye size={14} aria-hidden="true" />
                      View
                    </Button>
                    {!state.completed && (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void remove(doc.uploaded!.id)} aria-label={`Remove ${doc.label}`}>
                        <Trash2 size={14} aria-hidden="true" />
                      </Button>
                    )}
                  </>
                )}
                {!state.completed && (
                  <>
                    <input
                      ref={(el) => {
                        inputs.current[doc.id] = el;
                      }}
                      id={`upload-${doc.id}`}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                      className="sr-only"
                      disabled={busy}
                      onChange={(e) => void onFile(doc.id, e.target.files?.[0])}
                    />
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => inputs.current[doc.id]?.click()}>
                      <FileUp size={14} aria-hidden="true" />
                      {doc.uploaded ? "Replace" : "Upload"}
                    </Button>
                  </>
                )}
              </div>
            </div>
            {localErrors[doc.id] && <p role="alert" className="mt-1.5 text-[12px] text-rose-600">{localErrors[doc.id]}</p>}
          </li>
        ))}
      </ul>
      {!state.completed && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-slate-500">
            {state.documents.filter((d) => d.uploaded).length} of {state.documents.length} uploaded · PDF, JPG or PNG, up to 5 MB
          </span>
          <Button size="sm" disabled={busy || !allUploaded} onClick={() => void submit({ complete: true })}>
            Submit documents
          </Button>
        </div>
      )}
    </div>
  );
}
