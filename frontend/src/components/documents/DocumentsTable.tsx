import { FileText, LoaderCircle, Trash2 } from "lucide-react";
import type { DocumentFileType, DocumentStatus, PolicyDocument } from "../../types/policyDocuments";
import { formatBytes, formatDate, formatTime } from "../../utils/format";
import { Badge, type BadgeTone } from "../ui/Badge";

const statusMeta: Record<DocumentStatus, { label: string; tone: BadgeTone }> = {
  ready: { label: "Ready", tone: "green" },
  processing: { label: "Processing", tone: "blue" },
  failed: { label: "Failed", tone: "red" },
};

const typeColors: Record<DocumentFileType, string> = {
  pdf: "bg-rose-50 text-rose-600",
  docx: "bg-primary-50 text-primary-600",
  txt: "bg-slate-100 text-slate-600",
};

interface DocumentsTableProps {
  documents: PolicyDocument[];
  deletingId: string | null;
  /** Omit for a read-only list (employees can't delete documents; the API enforces this too). */
  onDelete?: (document: PolicyDocument) => void;
}

const headerCell = "eyebrow whitespace-nowrap px-4 py-3 text-left text-slate-400";

export function DocumentsTable({ documents, deletingId, onDelete }: DocumentsTableProps) {
  return (
    <div className="relative overflow-x-auto">
      {/* "relative" keeps absolutely positioned children (e.g. sr-only labels) inside the scroll area. */}
      <table className="w-full min-w-[540px] text-[13px]">
        <caption className="sr-only">Uploaded policy documents</caption>
        <thead className="border-b border-line">
          <tr>
            <th scope="col" className={`${headerCell} pl-5 sm:pl-6`}>Document</th>
            <th scope="col" className={headerCell}>Uploaded</th>
            <th scope="col" className={headerCell}>Status</th>
            <th scope="col" className={`${headerCell} text-right`}>Chunks</th>
            {onDelete && (
              <th scope="col" className={`${headerCell} pr-5 text-right sm:pr-6`}>
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {documents.map((doc) => {
            const status = statusMeta[doc.status];
            const deleting = deletingId === doc.id;
            return (
              <tr key={doc.id} className={`animate-fade-in transition-colors hover:bg-surface/70 ${deleting ? "opacity-50" : ""}`}>
                <td className="py-3 pl-5 pr-4 sm:pl-6">
                  <div className="flex items-center gap-3">
                    <span className={`flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg ${typeColors[doc.fileType]}`}>
                      <FileText size={14} aria-hidden="true" />
                      <span className="text-[8.5px] font-bold uppercase leading-none">{doc.fileType}</span>
                    </span>
                    <div className="min-w-0">
                      <p className="max-w-[240px] truncate font-semibold text-navy-900" title={doc.filename}>
                        {doc.filename}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatBytes(doc.sizeBytes)}
                        {doc.pageCount !== null && ` · ${doc.pageCount} page${doc.pageCount === 1 ? "" : "s"}`}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                  <span className="block">{formatDate(doc.uploadedAt)}</span>
                  <span className="block text-xs text-slate-400">{formatTime(doc.uploadedAt)}</span>
                </td>
                <td className="px-4 py-3">
                  <span title={doc.errorMessage ?? undefined}>
                    <Badge tone={status.tone} dot>
                      {status.label}
                    </Badge>
                  </span>
                  {doc.status === "failed" && doc.errorMessage && <p className="mt-1 max-w-[220px] text-[11px] leading-snug text-rose-600">{doc.errorMessage}</p>}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-navy-900 tabular-nums">{doc.status === "ready" ? doc.chunkCount : "—"}</td>
                {onDelete && (
                  <td className="py-3 pl-4 pr-5 text-right sm:pr-6">
                    <button
                      type="button"
                      onClick={() => onDelete(doc)}
                      disabled={deleting}
                      className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-wait"
                      aria-label={`Delete ${doc.filename}`}
                    >
                      {deleting ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <Trash2 size={15} aria-hidden="true" />}
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
