import type { OnboardingStageName, OnboardingStageProgress, OnboardingTask } from "./dashboard";

export type HrOnboardingStatus = "at_risk" | "not_started" | "on_track" | "completed";

/** One employee's onboarding summary, as returned by GET /api/v1/hr/employees. */
export interface HrEmployeeRecord {
  id: number;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  jobTitle: string;
  jobRole?: string | null;
  jobRoleLabel?: string | null;
  department: string;
  location: string;
  startDate: string;
  managerName: string | null;
  status: HrOnboardingStatus;
  /** First stage with open tasks; null once everything is complete. */
  currentStage: OnboardingStageName | null;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  pendingTasks: number;
  overdueTasks: number;
  completionPercentage: number;
  nextDueDate: string | null;
  lastActivityAt: string | null;
}

export interface HrStatusCounts {
  atRisk: number;
  notStarted: number;
  onTrack: number;
  completed: number;
}

export interface HrEmployeeList {
  employees: HrEmployeeRecord[];
  /** Per status, for employees matching the search/department filters. */
  statusCounts: HrStatusCounts;
  totalMatching: number;
  totalEmployees: number;
}

export interface HrSummary {
  totalEmployees: number;
  statusCounts: HrStatusCounts;
  totalTasks: number;
  completedTasks: number;
  openTasks: number;
  inProgressTasks: number;
  overdueTasks: number;
  averageCompletion: number;
  departments: string[];
  referenceDate: string;
}

export interface HrEmployeeDetail {
  employee: HrEmployeeRecord;
  buddyName: string | null;
  progress: {
    totalTasks: number;
    completedTasks: number;
    inProgressTasks: number;
    pendingTasks: number;
    overdueTasks: number;
    completionPercentage: number;
    referenceDate: string;
    stages: OnboardingStageProgress[];
  };
  tasks: OnboardingTask[];
}

export interface HrEmployeeFilters {
  search?: string;
  department?: string;
  status?: HrOnboardingStatus;
}
