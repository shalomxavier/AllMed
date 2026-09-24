import React, { useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';

export type LeaveDuration = 'full_day' | 'half_day';
export type HalfDayPeriod = 'first_half' | 'second_half';
export interface LeaveSelection {
  reason: string;
  duration: LeaveDuration;
  halfDayPeriod?: HalfDayPeriod;
}

export const leavePeriodLabel = (leave: { duration?: LeaveDuration; halfDayPeriod?: HalfDayPeriod }) =>
  leave.duration !== 'half_day' ? 'Full Day' : leave.halfDayPeriod === 'first_half' ? 'First Half' : 'Second Half';

export const LEAVE_REASONS = ['Week Off', 'Casual Leave', 'Earned Leave', 'Holiday Off', 'Overtime Off'];

export const leaveDotClass = (reason: string | undefined, halfDay = false): string => {
  const r = (reason ?? '').toLowerCase();
  if (r.includes('week off')) return halfDay ? 'bg-blue-600/50' : 'bg-blue-600';
  if (r.includes('casual')) return halfDay ? 'bg-green-600/50' : 'bg-green-600';
  if (r.includes('earned') || r.includes('privilege')) return halfDay ? 'bg-indigo-600/50' : 'bg-indigo-600';
  if (r.includes('holiday') || r.includes('festival')) return halfDay ? 'bg-yellow-500/50' : 'bg-yellow-500';
  if (r.includes('overtime')) return halfDay ? 'bg-orange-500/50' : 'bg-orange-500';
  return halfDay ? 'bg-purple-600/50' : 'bg-purple-600';
};

interface LeaveOptionMenuProps {
  onSelect: (selection: LeaveSelection) => void;
  current?: LeaveSelection | null;
}

export const LeaveOptionMenu: React.FC<LeaveOptionMenuProps> = ({ onSelect, current }) => {
  const [halfDayPeriod, setHalfDayPeriod] = useState<HalfDayPeriod | null>(
    current?.duration === 'half_day' ? current?.halfDayPeriod ?? null : null
  );

  const renderLeaveOptions = (duration: LeaveDuration) => (
    LEAVE_REASONS.map((reason) => {
      const isCurrent = duration === 'half_day'
        ? current?.duration === 'half_day' && current?.halfDayPeriod === halfDayPeriod && current?.reason === reason
        : current?.duration !== 'half_day' && current?.reason === reason;
      return (
        <button
          key={reason}
          type="button"
          onClick={() => onSelect(duration === 'half_day' ? { reason, duration, halfDayPeriod: halfDayPeriod ?? undefined } : { reason, duration })}
          className={`w-full flex items-center justify-between px-2 py-1.5 text-sm rounded hover:bg-secondary-50 ${isCurrent ? 'bg-purple-50 text-purple-700 font-semibold' : 'text-secondary-700'}`}
        >
          <span>{reason}</span>
          {isCurrent && <Check size={14} className="text-purple-600" />}
        </button>
      );
    })
  );

  const halfDayButtonClass = (period: HalfDayPeriod) =>
    `w-full flex items-center justify-between px-2 py-1.5 text-sm rounded hover:bg-secondary-50 ${
      current?.duration === 'half_day' && current?.halfDayPeriod === period ? 'text-purple-700 font-semibold' : 'text-secondary-700'
    }`;

  return (
    <>
      {!halfDayPeriod ? (
        <>
          {renderLeaveOptions('full_day')}
          <button type="button" onClick={() => setHalfDayPeriod('first_half')}
            className={halfDayButtonClass('first_half')}><span>Half Day (First)</span><ChevronRight size={14} /></button>
          <button type="button" onClick={() => setHalfDayPeriod('second_half')}
            className={halfDayButtonClass('second_half')}><span>Half Day (Second)</span><ChevronRight size={14} /></button>
        </>
      ) : (
        <button type="button" className="w-full flex items-center justify-between px-2 py-1.5 text-sm rounded bg-secondary-50 text-secondary-700">
          <span>{halfDayPeriod === 'first_half' ? 'Half Day (First)' : 'Half Day (Second)'}</span><ChevronRight size={14} />
        </button>
      )}
      {halfDayPeriod && (
        <div className="mt-1 pt-1 border-t border-secondary-100">
          <p className="px-2 py-1 text-xs font-semibold text-secondary-500">Select leave type</p>
          {renderLeaveOptions('half_day')}
        </div>
      )}
    </>
  );
};
