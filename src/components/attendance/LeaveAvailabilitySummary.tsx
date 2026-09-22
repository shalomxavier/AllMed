import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatLeaveCount, type LeaveAvailabilitySummary as Availability } from '@/utils/leaveLimits';

interface Props {
  summaries: Availability[];
  aggregate?: boolean;
  title?: string;
  emptyMessage?: string;
  compact?: boolean;
}

const statusClass = (summary: Availability) => {
  if (summary.status !== 'configured') return summary.status === 'overlapping_limits' ? 'border-red-200 bg-red-50' : 'border-secondary-200 bg-secondary-50';
  const remaining = summary.remainingAfterSelection ?? 0;
  if (remaining < 0) return 'border-red-200 bg-red-50';
  if (remaining === 0) return 'border-amber-200 bg-amber-50';
  return 'border-green-200 bg-green-50';
};

const DetailRow: React.FC<{ summary: Availability; compact?: boolean }> = ({ summary, compact }) => (
  <div className={`rounded-lg border ${statusClass(summary)} ${compact ? 'px-2 py-1.5' : 'p-2.5'}`}>
    <div className="flex items-center justify-between gap-2">
      <p className="text-xs font-semibold text-secondary-800 truncate">
        {summary.employeeName ? `${summary.employeeName} · ` : ''}{summary.leaveType}
      </p>
      {summary.fromDate && <span className="text-[10px] text-secondary-500 whitespace-nowrap">{summary.fromDate} → {summary.toDate}</span>}
    </div>
    {summary.status === 'no_limit' ? (
      <p className="mt-1 text-xs font-medium text-secondary-600">No limit assigned</p>
    ) : summary.status === 'overlapping_limits' ? (
      <p className="mt-1 text-xs font-medium text-red-700">Overlapping limit periods</p>
    ) : (
      <div className="mt-1 grid grid-cols-4 gap-1 text-center">
        <div><p className="text-[10px] text-secondary-500">Assigned</p><p className="text-xs font-bold text-secondary-900">{formatLeaveCount(summary.assigned)}</p></div>
        <div><p className="text-[10px] text-secondary-500">Used</p><p className="text-xs font-bold text-secondary-900">{formatLeaveCount(summary.used)}</p></div>
        <div><p className="text-[10px] text-secondary-500">Selected</p><p className="text-xs font-bold text-blue-700">{formatLeaveCount(summary.selected)}</p></div>
        <div><p className="text-[10px] text-secondary-500">Remaining</p><p className={`text-xs font-bold ${(summary.remainingAfterSelection ?? 0) < 0 ? 'text-red-700' : 'text-green-700'}`}>{formatLeaveCount(summary.remainingAfterSelection)}</p></div>
      </div>
    )}
  </div>
);

export const LeaveAvailabilitySummary: React.FC<Props> = ({ summaries, aggregate = false, title = 'Leave Availability', emptyMessage, compact }) => {
  const [expanded, setExpanded] = useState(false);
  if (summaries.length === 0) return emptyMessage ? <p className="text-xs text-secondary-500">{emptyMessage}</p> : null;
  if (!aggregate) return (
    <div className="space-y-2">
      {!compact && <p className="text-sm font-medium text-secondary-700">{title}</p>}
      {summaries.map((summary, index) => <DetailRow key={`${summary.employeeCode}-${summary.leaveType}-${summary.fromDate ?? summary.dates.join(',')}-${index}`} summary={summary} compact={compact} />)}
    </div>
  );

  const employeeCount = new Set(summaries.map((summary) => summary.employeeCode.trim().toLowerCase())).size;
  const configured = summaries.filter((summary) => summary.status === 'configured');
  const noLimitCount = summaries.filter((summary) => summary.status === 'no_limit').length;
  const lowestRemaining = configured.length ? Math.min(...configured.map((summary) => summary.remainingAfterSelection ?? 0)) : undefined;
  return (
    <div className="rounded-lg border border-secondary-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-secondary-800">{title}</p>
          <p className="text-xs text-secondary-500 mt-0.5">
            {employeeCount} employee{employeeCount === 1 ? '' : 's'} · {configured.length} configured · {noLimitCount} no limit
          </p>
        </div>
        {lowestRemaining !== undefined && (
          <div className="text-right">
            <p className="text-[10px] text-secondary-500">Lowest remaining</p>
            <p className={`text-base font-bold ${lowestRemaining < 0 ? 'text-red-700' : lowestRemaining === 0 ? 'text-amber-700' : 'text-green-700'}`}>{formatLeaveCount(lowestRemaining)}</p>
          </div>
        )}
      </div>
      <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-purple-700 hover:text-purple-800">
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}{expanded ? 'Hide details' : 'View details'}
      </button>
      {expanded && <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">{summaries.map((summary, index) => <DetailRow key={`${summary.employeeCode}-${summary.leaveType}-${summary.fromDate ?? summary.dates.join(',')}-${index}`} summary={summary} compact />)}</div>}
    </div>
  );
};
