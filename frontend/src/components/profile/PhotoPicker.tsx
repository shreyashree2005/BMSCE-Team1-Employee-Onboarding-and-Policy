import { useEffect, useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { photoError } from "../../utils/validation";
import { Button } from "../ui/Button";
import { UserAvatar } from "../ui/UserAvatar";

interface PhotoPickerProps {
  /** Current saved photo (API path), shown when no new file is chosen. */
  photoUrl?: string | null;
  initials?: string;
  busy?: boolean;
  /** Called with a validated file (JPG/PNG, at most 2 MB). */
  onSelect: (file: File) => void;
  onRemove?: () => void;
  /** A file chosen but not uploaded yet (e.g. during registration), previewed locally. */
  pendingFile?: File | null;
  label?: string;
}

/** Circular photo preview with Upload / Replace / Remove. Files are checked here and validated again by the server. */
export function PhotoPicker({ photoUrl, initials, busy = false, onSelect, onRemove, pendingFile, label = "Profile photo" }: PhotoPickerProps) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingFile) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(pendingFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  const choose = (file: File | undefined) => {
    if (input.current) input.current.value = "";
    if (!file) return;
    const problem = photoError(file);
    setError(problem);
    if (!problem) onSelect(file);
  };

  const hasPhoto = Boolean(preview || photoUrl);
  return (
    <div className="flex items-center gap-4">
      {preview ? (
        <img src={preview} alt="" className="h-20 w-20 shrink-0 rounded-full object-cover ring-2 ring-primary-100" />
      ) : (
        <UserAvatar photoUrl={photoUrl} initials={initials} size="xl" className="!h-20 !w-20" />
      )}
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-navy-900">{label}</p>
        <p className="text-xs text-slate-500">JPG or PNG, up to 2 MB. Shown as a circle in the top-right corner.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,.jpg,.jpeg,.png"
            className="sr-only"
            aria-label={hasPhoto ? "Replace photo" : "Upload photo"}
            onChange={(e) => choose(e.target.files?.[0])}
            disabled={busy}
          />
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
            <Camera size={14} aria-hidden="true" />
            {hasPhoto ? "Replace photo" : "Upload photo"}
          </Button>
          {hasPhoto && onRemove && (
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onRemove}>
              <Trash2 size={14} aria-hidden="true" />
              Remove
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-1.5 text-[12px] text-rose-600">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
