import { useCallback, useEffect, useState } from "react";
import { FolderOpen, RefreshCw } from "lucide-react";
import { DeleteDocumentDialog } from "../components/documents/DeleteDocumentDialog";
import { DocumentsTable } from "../components/documents/DocumentsTable";
import { PolicySearchPanel } from "../components/documents/PolicySearchPanel";
import { UploadDropzone } from "../components/documents/UploadDropzone";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { PageHeader } from "../components/ui/PageHeader";
import { Skeleton } from "../components/ui/Skeleton";
import { useCurrentUser } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { ApiError } from "../services/apiClient";
import { deletePolicyDocument, fetchPolicyDocuments, uploadPolicyDocument, validateFileForUpload } from "../services/policyDocumentsApi";
import type { PolicyDocument } from "../types/policyDocuments";

type ListState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready" };

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export function PolicyDocumentsPage() {
  const { showToast } = useToast();
  // Only HR manages the knowledge base; employees browse and search it. The API enforces the same rule.
  const canManage = useCurrentUser().role === "hr";
  const [documents, setDocuments] = useState<PolicyDocument[]>([]);
  const [listState, setListState] = useState<ListState>({ kind: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [uploadingName, setUploadingName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PolicyDocument | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setListState({ kind: "loading" });
    fetchPolicyDocuments(controller.signal)
      .then((loaded) => {
        setDocuments(loaded);
        setListState({ kind: "ready" });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setListState({ kind: "error", message: messageFrom(error, "Could not load documents.") });
      });
    return () => controller.abort();
  }, [reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  const handleUpload = async (file: File) => {
    const problem = validateFileForUpload(file);
    if (problem) {
      setUploadError(problem);
      return;
    }
    setUploadError(null);
    setUploadingName(file.name);
    try {
      const document = await uploadPolicyDocument(file);
      setDocuments((prev) => [document, ...prev.filter((d) => d.id !== document.id)]);
      showToast(`“${document.filename}” is ready: ${document.chunkCount} passages indexed.`);
    } catch (error) {
      const message = messageFrom(error, "The upload failed. Please try again.");
      setUploadError(message);
      showToast(`Upload failed: ${message}`, "error");
      // A server-side processing failure leaves a "failed" record; refresh so it's visible.
      if (error instanceof ApiError && error.status !== null && error.status >= 500) reload();
    } finally {
      setUploadingName(null);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setDeletingId(target.id);
    try {
      await deletePolicyDocument(target.id);
      setDocuments((prev) => prev.filter((d) => d.id !== target.id));
      showToast(`Deleted “${target.filename}”.`);
      setPendingDelete(null);
    } catch (error) {
      showToast(`Couldn't delete “${target.filename}”. ${messageFrom(error, "Please try again.")}`, "error");
    } finally {
      setDeletingId(null);
    }
  };

  const readyCount = documents.filter((d) => d.status === "ready").length;
  const totalChunks = documents.reduce((sum, d) => sum + (d.status === "ready" ? d.chunkCount : 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Knowledge base"
        title="Policy Documents"
        description={
          canManage
            ? "Upload approved policy documents. Their text is split into passages and indexed so they can be searched by meaning."
            : "Approved company policies published by HR. Search them by meaning, or ask the Policy Assistant."
        }
        actions={
          listState.kind === "ready" && documents.length > 0 ? (
            <div className="flex items-center gap-4 rounded-panel border border-line bg-white px-4 py-2.5 text-[13px] shadow-card">
              <span>
                <span className="font-semibold text-navy-900 tabular-nums">{readyCount}</span> <span className="text-slate-500">ready</span>
              </span>
              <span className="h-4 w-px bg-line" aria-hidden="true" />
              <span>
                <span className="font-semibold text-navy-900 tabular-nums">{totalChunks}</span> <span className="text-slate-500">passages indexed</span>
              </span>
            </div>
          ) : undefined
        }
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-6">
          {canManage && (
            <section aria-labelledby="upload-heading" className="rounded-panel border border-line bg-white p-5 shadow-card sm:p-6">
              <h2 id="upload-heading" className="mb-4 text-[15px] font-semibold tracking-tight text-primary-700">
                Upload a document
              </h2>
              <UploadDropzone uploadingName={uploadingName} error={uploadError} onFileSelected={(file) => void handleUpload(file)} />
            </section>
          )}

          <section aria-labelledby="documents-heading" className="rounded-panel border border-line bg-white shadow-card">
            <div className="flex items-center justify-between border-b border-line px-5 py-4 sm:px-6">
              <div>
                <h2 id="documents-heading" className="text-[15px] font-semibold tracking-tight text-primary-700">
                  {canManage ? "Uploaded documents" : "Policy library"}
                </h2>
                <p className="mt-0.5 text-[13px] text-slate-500">
                  {canManage ? "Deleting a document also removes it from search." : "Documents the Policy Assistant answers from."}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={reload} disabled={listState.kind === "loading"} aria-label="Refresh document list">
                <RefreshCw size={14} className={listState.kind === "loading" ? "animate-spin" : ""} aria-hidden="true" />
                Refresh
              </Button>
            </div>

            {listState.kind === "loading" ? (
              <div role="status" aria-label="Loading documents" className="divide-y divide-line">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3 px-6 py-4">
                    <Skeleton className="h-9 w-9 rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3.5 w-1/3" />
                      <Skeleton className="h-3 w-1/5" />
                    </div>
                    <Skeleton className="h-5 w-16 rounded-md" />
                  </div>
                ))}
              </div>
            ) : listState.kind === "error" ? (
              <ErrorState title="We couldn't load your documents" message={listState.message} onRetry={reload} />
            ) : documents.length === 0 ? (
              <EmptyState
                icon={FolderOpen}
                title="No policy documents yet"
                message={canManage ? "Upload a PDF, DOCX or TXT policy to build your searchable knowledge base." : "HR hasn't published any policy documents yet."}
              />
            ) : (
              <DocumentsTable documents={documents} deletingId={deletingId} onDelete={canManage ? setPendingDelete : undefined} />
            )}
          </section>
        </div>

        <div className="xl:sticky xl:top-24">
          <PolicySearchPanel documents={documents} documentsLoading={listState.kind === "loading"} />
        </div>
      </div>

      <DeleteDocumentDialog document={pendingDelete} deleting={deletingId !== null} onCancel={() => setPendingDelete(null)} onConfirm={() => void confirmDelete()} />
    </div>
  );
}
