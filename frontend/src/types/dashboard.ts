export interface EmployeeProfile {
  firstName: string;
  lastName: string;
  role: string;
  department: string;
  location: string;
  email: string;
  startDate: string;
  manager: string;
  buddy: string;
}

export type OnboardingStageName = "Welcome" | "Documentation" | "Payroll & Benefits" | "Training" | "Ready to Go";

export type StageStatus = "completed" | "current" | "upcoming";

export interface OnboardingStageProgress {
  name: OnboardingStageName;
  completedTasks: number;
  totalTasks: number;
  status: StageStatus;
}

export type TaskPriority = "high" | "medium" | "low";

export type TaskStatus = "pending" | "in_progress" | "completed";

export type TaskCategory =
  | "Documents"
  | "Payroll"
  | "IT Setup"
  | "Orientation"
  | "Team"
  | "Compliance"
  | "Benefits"
  | "HR Forms"
  | "Learning";

export interface OnboardingTask {
  id: string;
  stage: OnboardingStageName;
  title: string;
  description: string;
  category: TaskCategory;
  dueDate: string;
  priority: TaskPriority;
  status: TaskStatus;
  /** When the task last changed (ISO timestamp from the server). */
  updatedAt?: string | null;
  /** What completes the task: form, document_upload, checklist, policy_acknowledgment, training or quiz. */
  actionType?: "form" | "document_upload" | "checklist" | "policy_acknowledgment" | "training" | "quiz" | null;
  completedAt?: string | null;
  /** IDs of tasks that must be completed before this one can be started or completed. */
  dependsOn?: string[];
  /** Catalog order (lower first); breaks ties when recommending the next task. */
  sequence?: number;
  /** Time tracking from server timestamps: first start, start of the current active period, total active seconds. */
  firstStartedAt?: string | null;
  activeSince?: string | null;
  timeSpentSeconds?: number | null;
}

export type RecentActivityKind = "task" | "document" | "training" | "event";

export interface RecentActivityItem {
  id: string;
  kind: RecentActivityKind;
  title: string;
  detail?: string;
  timestamp: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
  /** In-app route to open when the notification is clicked. */
  link?: string;
}

export interface HrContact {
  team: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  hours: string;
}
