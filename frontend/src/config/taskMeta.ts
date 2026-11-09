import type { LucideIcon } from "lucide-react";
import {
  ClipboardList,
  Compass,
  FileText,
  GraduationCap,
  HeartPulse,
  Laptop,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import type { BadgeTone } from "../components/ui/Badge";
import type { TaskCategory, TaskPriority, TaskStatus } from "../types/dashboard";

export const taskCategoryIcons: Record<TaskCategory, LucideIcon> = {
  Documents: FileText,
  Payroll: Wallet,
  "IT Setup": Laptop,
  Orientation: Compass,
  Team: Users,
  Compliance: ShieldCheck,
  Benefits: HeartPulse,
  "HR Forms": ClipboardList,
  Learning: GraduationCap,
};

export const taskStatusMeta: Record<TaskStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: "Pending", tone: "gray" },
  in_progress: { label: "In progress", tone: "blue" },
  completed: { label: "Completed", tone: "green" },
};

export const taskPriorityMeta: Record<TaskPriority, { label: string; tone: BadgeTone }> = {
  high: { label: "High", tone: "red" },
  medium: { label: "Medium", tone: "amber" },
  low: { label: "Low", tone: "gray" },
};
