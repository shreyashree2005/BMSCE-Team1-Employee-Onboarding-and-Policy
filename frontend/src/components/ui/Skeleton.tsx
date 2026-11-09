/** Shimmering placeholder block shown while content is loading. */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-shimmer rounded bg-[linear-gradient(90deg,#eef2f8_0%,#f7f9fc_50%,#eef2f8_100%)] bg-[length:200%_100%] ${className}`}
    />
  );
}
