interface AssistantMarkProps {
  size?: number;
  /** "solid" is a blue tile; "inverse" is a white tile for use on blue backgrounds. */
  variant?: "solid" | "inverse";
}

/** Visual identity of the OnboardIQ policy assistant: a four-point spark inside a rounded tile. */
export function AssistantMark({ size = 36, variant = "solid" }: AssistantMarkProps) {
  const tile = variant === "solid" ? "#346FE7" : "#FFFFFF";
  const spark = variant === "solid" ? "#FFFFFF" : "#346FE7";
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true" className="shrink-0">
      <rect width="36" height="36" rx="10" fill={tile} />
      <path d="M18 8.5c.7 4.6 2.9 6.8 7.5 7.5-4.6.7-6.8 2.9-7.5 7.5-.7-4.6-2.9-6.8-7.5-7.5 4.6-.7 6.8-2.9 7.5-7.5Z" fill={spark} />
      <path d="M25.5 22.5c.3 1.8 1.2 2.7 3 3-1.8.3-2.7 1.2-3 3-.3-1.8-1.2-2.7-3-3 1.8-.3 2.7-1.2 3-3Z" fill={spark} opacity="0.75" />
    </svg>
  );
}
