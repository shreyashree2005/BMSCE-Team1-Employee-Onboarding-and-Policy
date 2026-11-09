export type UserRole = "employee" | "hr";

/** Work profile of an employee account (HR accounts have none). Mirrors the API's EmployeeProfileOut. */
export interface AccountProfile {
  firstName: string;
  lastName: string;
  jobTitle: string;
  department: string;
  location: string;
  startDate: string;
  managerName: string | null;
  buddyName: string | null;
  /** Job function chosen at sign-up (e.g. "software_developer"); null for older accounts. */
  jobRole?: string | null;
  jobRoleLabel?: string | null;
}

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  role: UserRole;
  profile: AccountProfile | null;
  /** API path of the profile photo (versioned), or null for the default avatar. */
  photoUrl?: string | null;
  /** First-visit guidance finished or dismissed ("Don't show this again"). */
  tourCompleted?: boolean;
  companyIntroSeen?: boolean;
}

export interface AuthSession {
  user: AuthUser;
  expiresAt: string;
}
