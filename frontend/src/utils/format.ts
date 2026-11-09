const shortDateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const longDateFormatter = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" });

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Parses an ISO date (YYYY-MM-DD) as a local date, avoiding timezone shifts. */
function parseIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatShortDate(isoDate: string): string {
  return shortDateFormatter.format(parseIsoDate(isoDate));
}

export function formatLongDate(isoDate: string): string {
  return longDateFormatter.format(parseIsoDate(isoDate));
}

/** Whole days from `fromIsoDate` to `toIsoDate` (negative when `toIsoDate` is earlier). */
export function daysBetween(fromIsoDate: string, toIsoDate: string): number {
  return Math.round((parseIsoDate(toIsoDate).getTime() - parseIsoDate(fromIsoDate).getTime()) / MS_PER_DAY);
}

export function percentage(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

export function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export function getGreeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const timestampDateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const timestampTimeFormatter = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

function formatTimestamp(isoTimestamp: string, formatter: Intl.DateTimeFormat): string {
  const date = new Date(isoTimestamp);
  return Number.isNaN(date.getTime()) ? "—" : formatter.format(date);
}

/** Date part of an ISO timestamp in local time, e.g. "Nov 7, 2026". */
export function formatDate(isoTimestamp: string): string {
  return formatTimestamp(isoTimestamp, timestampDateFormatter);
}

/** Time part of an ISO timestamp in local time, e.g. "2:30 PM". */
export function formatTime(isoTimestamp: string): string {
  return formatTimestamp(isoTimestamp, timestampTimeFormatter);
}

/** A duration in words, e.g. "4 minutes 32 seconds" or "1 hour 5 minutes" (seconds are dropped once hours appear). */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (hours > 0) return [unit(hours, "hour"), minutes ? unit(minutes, "minute") : ""].filter(Boolean).join(" ");
  if (minutes > 0) return [unit(minutes, "minute"), secs ? unit(secs, "second") : ""].filter(Boolean).join(" ");
  return unit(secs, "second");
}
