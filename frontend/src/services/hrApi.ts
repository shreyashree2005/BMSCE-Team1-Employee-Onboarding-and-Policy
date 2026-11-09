import type { HrEmployeeDetail, HrEmployeeFilters, HrEmployeeList, HrSummary } from "../types/hr";
import { ApiError, apiRequest } from "./apiClient";

const BASE_PATH = "/api/v1/hr";

function expectObject<T>(value: unknown, keys: string[], what: string): T {
  if (!value || typeof value !== "object" || keys.some((key) => !(key in value))) {
    throw new ApiError(`The server returned an unexpected ${what} format.`, null);
  }
  return value as T;
}

export async function fetchHrSummary(signal?: AbortSignal): Promise<HrSummary> {
  const data = await apiRequest<unknown>(`${BASE_PATH}/summary`, { signal });
  return expectObject<HrSummary>(data, ["totalEmployees", "statusCounts", "openTasks", "overdueTasks", "departments"], "summary");
}

export async function fetchHrEmployees(filters: HrEmployeeFilters = {}, signal?: AbortSignal): Promise<HrEmployeeList> {
  const params = new URLSearchParams();
  if (filters.search?.trim()) params.set("search", filters.search.trim());
  if (filters.department) params.set("department", filters.department);
  if (filters.status) params.set("status", filters.status);
  const query = params.toString();
  const data = await apiRequest<unknown>(`${BASE_PATH}/employees${query ? `?${query}` : ""}`, { signal });
  const list = expectObject<HrEmployeeList>(data, ["employees", "statusCounts", "totalMatching", "totalEmployees"], "employee list");
  if (!Array.isArray(list.employees)) throw new ApiError("The server returned an unexpected employee list format.", null);
  return list;
}

export async function fetchHrEmployee(employeeId: number, signal?: AbortSignal): Promise<HrEmployeeDetail> {
  const data = await apiRequest<unknown>(`${BASE_PATH}/employees/${employeeId}`, { signal });
  return expectObject<HrEmployeeDetail>(data, ["employee", "progress", "tasks"], "employee");
}
