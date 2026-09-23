import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';

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

interface LeaveOptionMenuProps {
  onSelect: (selection: LeaveSelection) => void;
}

export const LeaveOptionMenu: React.FC<LeaveOptionMenuProps> = ({ onSelect }) => {
  const [halfDayPeriod, setHalfDayPeriod] = useState<HalfDayPeriod | null>(null);

  const renderLeaveOptions = (duration: LeaveDuration) => (
    LEAVE_REASONS.map((reason) => (
      <button
        key={reason}
        type="button"
        onClick={() => onSelect(duration === 'half_day' ? { reason, duration, halfDayPeriod: halfDayPeriod ?? undefined } : { reason, duration })}
        className="w-full text-left px-2 py-1.5 text-sm rounded text-secondary-700 hover:bg-secondary-50"
      >
        <span>{reason}</span>
      </button>
    ))
  );

  return (
    <>
      {!halfDayPeriod ? (
        <>
          {renderLeaveOptions('full_day')}
          <button type="button" onClick={() => setHalfDayPeriod('first_half')}
            className="w-full flex items-center justify-between px-2 py-1.5 text-sm rounded text-secondary-700 hover:bg-secondary-50"><span>Half Day (First)</span><ChevronRight size={14} /></button>
          <button type="button" onClick={() => setHalfDayPeriod('second_half')}
            className="w-full flex items-center justify-between px-2 py-1.5 text-sm rounded text-secondary-700 hover:bg-secondary-50"><span>Half Day (Second)</span><ChevronRight size={14} /></button>
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
