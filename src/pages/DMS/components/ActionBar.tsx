import { CheckCircle, XCircle, Calendar, Save, RotateCcw } from 'lucide-react';
import type { EnquiryStatus } from '../types';

interface ActionBarProps {
  status: EnquiryStatus;
  onSave: () => void;
  onReset: () => void;
  onMarkConverted: () => void;
  onMarkLost: () => void;
  onScheduleFollowUp: () => void;
  isSaving?: boolean;
}

export const ActionBar: React.FC<ActionBarProps> = ({
  status,
  onSave,
  onReset,
  onMarkConverted,
  onMarkLost,
  onScheduleFollowUp,
  isSaving = false,
}) => {
  // New or In Progress - Show workflow buttons
  if (status === 'New' || status === 'In Progress') {
    return (
      <div className="flex flex-col gap-2">
        <button
          onClick={onSave}
          disabled={isSaving}
          className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Save size={16} />
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={onMarkConverted}
            className="px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-xs font-medium flex items-center justify-center gap-1"
          >
            <CheckCircle size={14} />
            Converted
          </button>
          <button
            onClick={onMarkLost}
            className="px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-xs font-medium flex items-center justify-center gap-1"
          >
            <XCircle size={14} />
            Lost
          </button>
          <button
            onClick={onScheduleFollowUp}
            className="px-3 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors text-xs font-medium flex items-center justify-center gap-1"
          >
            <Calendar size={14} />
            Follow-up
          </button>
        </div>
        <button
          onClick={onReset}
          className="w-full px-4 py-2 bg-white border border-secondary-300 text-secondary-700 rounded-lg hover:bg-secondary-50 transition-colors text-sm font-medium flex items-center justify-center gap-2"
        >
          <RotateCcw size={16} />
          Reset
        </button>
      </div>
    );
  }

  // Converted - Show success indicator
  if (status === 'Converted') {
    return (
      <div className="card p-4 bg-green-50 border-green-200">
        <div className="flex items-center gap-2 text-green-700">
          <CheckCircle size={20} className="text-green-600" />
          <span className="font-medium">Conversation Completed</span>
        </div>
        <p className="text-xs text-green-600 mt-1">This enquiry has been successfully converted.</p>
      </div>
    );
  }

  // Lost - Show closed indicator
  if (status === 'Lost') {
    return (
      <div className="card p-4 bg-red-50 border-red-200">
        <div className="flex items-center gap-2 text-red-700">
          <XCircle size={20} className="text-red-600" />
          <span className="font-medium">Conversation Closed</span>
        </div>
        <p className="text-xs text-red-600 mt-1">This enquiry was marked as lost.</p>
      </div>
    );
  }

  // Follow-up - Show upcoming badge
  if (status === 'Follow-up') {
    return (
      <div className="card p-4 bg-purple-50 border-purple-200">
        <div className="flex items-center gap-2 text-purple-700">
          <Calendar size={20} className="text-purple-600" />
          <span className="font-medium">Upcoming Follow-up</span>
        </div>
        <p className="text-xs text-purple-600 mt-1">Follow-up scheduled for this enquiry.</p>
      </div>
    );
  }

  return null;
};
