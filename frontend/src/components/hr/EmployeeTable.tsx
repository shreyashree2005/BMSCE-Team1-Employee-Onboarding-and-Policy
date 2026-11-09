import type { HrEmployeeRecord } from "../../types/hr";
import { formatShortDate, getInitials } from "../../utils/format";
import { StageSegments } from "../journey/StageSegments";
import { Avatar } from "../ui/Avatar";
import { HrStatusBadge } from "./HrStatusBadge";

interface EmployeeTableProps {
  records: HrEmployeeRecord[];
  selectedId: number | undefined;
  onSelect: (record: HrEmployeeRecord) => void;
}

const headerCell = "eyebrow whitespace-nowrap px-4 py-3 text-left text-slate-400";

export function EmployeeTable({ records, selectedId, onSelect }: EmployeeTableProps) {
  return (
    <div className="relative overflow-x-auto">
      {/* "relative" keeps absolutely positioned children (e.g. sr-only labels) inside the scroll area. */}
      <table className="w-full min-w-[560px] text-[13px]">
        <caption className="sr-only">Employee onboarding progress</caption>
        <thead className="border-b border-line">
          <tr>
            <th scope="col" className={`${headerCell} pl-5 sm:pl-6`}>Employee</th>
            <th scope="col" className={`${headerCell} hidden 2xl:table-cell`}>Started</th>
            <th scope="col" className={headerCell}>Journey</th>
            <th scope="col" className={`${headerCell} text-right`}>Progress</th>
            <th scope="col" className={`${headerCell} hidden text-center sm:table-cell xl:hidden 2xl:table-cell`}>Overdue</th>
            <th scope="col" className={`${headerCell} pr-5 sm:pr-6`}>Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {records.map((record) => {
            const selected = record.id === selectedId;
            const stage = record.currentStage ?? "Completed";
            return (
              <tr key={record.id} onClick={() => onSelect(record)} className={`group cursor-pointer transition-colors ${selected ? "bg-primary-50/70" : "hover:bg-surface/80"}`}>
                <td className="relative py-3 pl-5 pr-4 sm:pl-6">
                  {selected && <span className="absolute inset-y-0 left-0 w-[3px] bg-primary-500" aria-hidden="true" />}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(record);
                    }}
                    className="focus-ring flex items-center gap-3 rounded text-left"
                    aria-pressed={selected}
                    aria-label={`Preview ${record.fullName}`}
                  >
                    <Avatar initials={getInitials(record.firstName, record.lastName)} size="sm" tone={selected ? "primary" : "light"} />
                    <span className="min-w-0">
                      <span className="block whitespace-nowrap font-semibold text-navy-900">{record.fullName}</span>
                      <span className="block max-w-[220px] truncate text-xs text-slate-500">
                        {record.jobTitle} · {record.department}
                      </span>
                    </span>
                  </button>
                </td>
                <td className="hidden whitespace-nowrap px-4 py-3 text-slate-600 2xl:table-cell">{formatShortDate(record.startDate)}</td>
                <td className="px-4 py-3">
                  <StageSegments currentStage={stage} />
                  <span className="mt-1 block whitespace-nowrap text-[11px] text-slate-500">{stage}</span>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-navy-900 tabular-nums">{record.completionPercentage}%</td>
                <td className="hidden px-4 py-3 text-center sm:table-cell xl:hidden 2xl:table-cell">
                  {record.overdueTasks > 0 ? (
                    <span className="inline-flex min-w-6 justify-center rounded-full bg-rose-50 px-1.5 py-0.5 text-xs font-semibold text-rose-700 tabular-nums">{record.overdueTasks}</span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="py-3 pl-4 pr-5 sm:pr-6">
                  <HrStatusBadge status={record.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
