import { useRef, useState, type DragEvent } from "react";
import { CircleAlert, FileUp, LoaderCircle } from "lucide-react";
import { ACCEPTED_EXTENSIONS } from "../../services/policyDocumentsApi";
import { Button } from "../ui/Button";

interface UploadDropzoneProps {
  /** File currently being uploaded and processed, if any. */
  uploadingName: string | null;
  error: string | null;
  onFileSelected: (file: File) => void;
}

/** Drag-and-drop or click-to-browse upload area for a single policy document. */
export function UploadDropzone({ uploadingName, error, onFileSelected }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const busy = uploadingName !== null;

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !busy) onFileSelected(file);
  };

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center rounded-panel border-2 border-dashed px-6 py-8 text-center transition-colors ${
          dragging ? "border-primary-400 bg-primary-50" : error ? "border-rose-200 bg-rose-50/40" : "border-line-strong bg-surface/60"
        }`}
      >
        {busy ? (
          <div role="status" className="flex flex-col items-center">
            <LoaderCircle size={28} className="animate-spin text-primary-500" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-navy-900">Processing “{uploadingName}”</p>
            <p className="mt-1 text-[13px] text-slate-500">Extracting text, creating chunks and building embeddings…</p>
            <p className="mt-2 text-[11px] text-slate-400">The first upload after a restart can take up to a minute while the model loads.</p>
          </div>
        ) : (
          <>
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-primary-500 shadow-card ring-1 ring-line">
              <FileUp size={22} aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm font-semibold text-navy-900">Drag a policy document here, or browse</p>
            <p className="mt-1 text-[13px] text-slate-500">PDF, DOCX or TXT · up to 10 MB</p>
            <Button className="mt-4" size="sm" onClick={() => inputRef.current?.click()}>
              Choose file
            </Button>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(",")}
          className="sr-only"
          aria-label="Upload a policy document"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFileSelected(file);
            event.target.value = ""; // allow choosing the same file again after an error
          }}
        />
      </div>
      {error && (
        <p role="alert" className="mt-2.5 flex items-start gap-1.5 text-[13px] text-rose-700">
          <CircleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
