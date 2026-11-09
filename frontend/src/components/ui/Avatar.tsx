import type { LucideIcon } from "lucide-react";

type AvatarSize = "xs" | "sm" | "md" | "lg";
type AvatarTone = "primary" | "navy" | "light";

const sizeClasses: Record<AvatarSize, string> = {
  xs: "h-7 w-7 text-[11px]",
  sm: "h-8 w-8 text-xs",
  md: "h-9 w-9 text-sm",
  lg: "h-12 w-12 text-base",
};

const iconSizes: Record<AvatarSize, number> = { xs: 14, sm: 16, md: 18, lg: 22 };

const toneClasses: Record<AvatarTone, string> = {
  primary: "bg-primary-500 text-white",
  navy: "bg-navy-900 text-white",
  light: "bg-primary-50 text-primary-700 ring-1 ring-inset ring-primary-100",
};

interface AvatarProps {
  initials?: string;
  icon?: LucideIcon;
  size?: AvatarSize;
  tone?: AvatarTone;
}

export function Avatar({ initials, icon: Icon, size = "md", tone = "primary" }: AvatarProps) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${sizeClasses[size]} ${toneClasses[tone]}`} aria-hidden="true">
      {Icon ? <Icon size={iconSizes[size]} /> : initials}
    </span>
  );
}
