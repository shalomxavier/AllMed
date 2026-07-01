import { Calendar, Clock } from 'lucide-react';

interface FollowUpSectionProps {
  followUpDate: Date | undefined;
  followUpTime: string;
  followUpReminderNote: string;
  onFollowUpDateChange: (date: Date | undefined) => void;
  onFollowUpTimeChange: (time: string) => void;
  onFollowUpReminderNoteChange: (note: string) => void;
}

export const FollowUpSection: React.FC<FollowUpSectionProps> = ({
  followUpDate,
  followUpTime,
  followUpReminderNote,
  onFollowUpDateChange,
  onFollowUpTimeChange,
  onFollowUpReminderNoteChange,
}) => {
  const formatDateForInput = (date: Date | undefined): string => {
    if (!date) return '';
    return date.toISOString().split('T')[0];
  };

  return (
    <div className="card p-4 border-l-4 border-l-purple-500">
      <h3 className="text-sm font-semibold text-secondary-900 mb-4 flex items-center gap-2">
        <Calendar size={16} className="text-purple-600" />
        Follow-up Schedule
      </h3>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-secondary-500 mb-2">Date</label>
          <input
            type="date"
            value={formatDateForInput(followUpDate)}
            onChange={(e) => {
              const value = e.target.value;
              onFollowUpDateChange(value ? new Date(value) : undefined);
            }}
            className="w-full px-3 py-2 border border-secondary-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-xs text-secondary-500 mb-2 flex items-center gap-1">
            <Clock size={12} />
            Time
          </label>
          <input
            type="time"
            value={followUpTime}
            onChange={(e) => onFollowUpTimeChange(e.target.value)}
            className="w-full px-3 py-2 border border-secondary-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-xs text-secondary-500 mb-2">Reminder Note</label>
          <textarea
            value={followUpReminderNote}
            onChange={(e) => onFollowUpReminderNoteChange(e.target.value)}
            placeholder="Add a reminder note for the follow-up..."
            rows={2}
            className="w-full px-3 py-2 border border-secondary-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
          />
        </div>
      </div>
    </div>
  );
};
