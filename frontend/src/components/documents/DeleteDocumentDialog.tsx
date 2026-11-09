import { Trash2 } from "lucide-react";
import type { PolicyDocument } from "../../types/policyDocuments";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

interface DeleteDocumentDialogProps {
  document: PolicyDocument | null;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteDocumentDialog({ document, deleting, onCancel, onConfirm }: DeleteDocumentDialogProps) {
  return (
    <Modal
      open={document !== null}
      title="Delete policy document?"
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={deleting}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={deleting} className="bg-rose-600 hover:bg-rose-700">
            <Trash2 size={15} aria-hidden="true" />
            {deleting ? "Deleting…" : "Delete document"}
          </Button>
        </>
      }
    >
      {document && (
        <p className="text-[13.5px] leading-relaxed text-slate-600">
          <span className="font-semibold text-navy-900">“{document.filename}”</span> and its {document.chunkCount} indexed passage
          {document.chunkCount === 1 ? "" : "s"} will be permanently removed. It will no longer appear in search results. This can't be undone.
        </p>
      )}
    </Modal>
  );
}
