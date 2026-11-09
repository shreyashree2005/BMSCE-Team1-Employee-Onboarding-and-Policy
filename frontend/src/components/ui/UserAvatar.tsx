import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { apiBlob } from "../../services/apiClient";

type Size = "sm" | "md" | "header" | "lg" | "xl";

const sizes: Record<Size, string> = {
  sm: "h-8 w-8 text-xs",
  md: "h-9 w-9 text-sm",
  // Top-right header photo: 40px on phones, 48px from tablet up, 52px on wide screens.
  header: "h-10 w-10 text-sm sm:h-12 sm:w-12 sm:text-base xl:h-[52px] xl:w-[52px]",
  lg: "h-12 w-12 text-base",
  xl: "h-24 w-24 text-2xl",
};

// One object URL per photo version, shared by every avatar on the page (top bar, menu, profile page).
const cache = new Map<string, Promise<string>>();

function loadPhoto(photoUrl: string): Promise<string> {
  let pending = cache.get(photoUrl);
  if (!pending) {
    pending = apiBlob(photoUrl).then((blob) => URL.createObjectURL(blob));
    pending.catch(() => cache.delete(photoUrl)); // allow a retry later
    cache.set(photoUrl, pending);
  }
  return pending;
}

interface UserAvatarProps {
  /** Adds a blue ring with a white gap around the photo. */
  ring?: boolean;
  /** API path of the photo (e.g. "/api/v1/auth/me/photo?v=…"); null shows initials or the default avatar. */
  photoUrl?: string | null;
  initials?: string;
  size?: Size;
  className?: string;
}

/** Circular profile photo, fetched with the session cookie. Falls back to initials, or a default avatar icon. */
export function UserAvatar({ photoUrl, initials, size = "md", ring = false, className = "" }: UserAvatarProps) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    if (photoUrl) {
      loadPhoto(photoUrl)
        .then((url) => !cancelled && setSrc(url))
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [photoUrl]);

  const ringClass = ring ? "ring-2 ring-primary-400 ring-offset-2 ring-offset-white" : "ring-2 ring-white";
  const base = `relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold ${sizes[size]} ${ringClass} ${className}`;
  if (src) return <img src={src} alt="" className={`${base} aspect-square object-cover object-center`} aria-hidden="true" />;
  return (
    <span className={`${base} bg-gradient-to-br from-primary-400 to-primary-700 text-white`} aria-hidden="true">
      {initials || <UserRound size={size === "xl" ? 40 : size === "header" || size === "lg" ? 22 : 18} />}
    </span>
  );
}
