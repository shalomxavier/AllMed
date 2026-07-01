import type { EnquiryStatus } from '../types';

interface StatusBadgeProps {
  status: EnquiryStatus;
  showFollowUpDate?: boolean;
  followUpDate?: Date;
}

const statusColors: Record<EnquiryStatus, string> = {
  'New': 'bg-blue-100 text-blue-700 border-blue-200',
  'In Progress': 'bg-orange-100 text-orange-700 border-orange-200',
  'Follow-up': 'bg-purple-100 text-purple-700 border-purple-200',
  'Converted': 'bg-green-100 text-green-700 border-green-200',
  'Lost': 'bg-red-100 text-red-700 border-red-200',
};

const getFollowUpText = (date: Date): string => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const followUp = new Date(date);
  followUp.setHours(0, 0, 0, 0);
  
  const diffTime = followUp.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return '📅 Today';
  if (diffDays === 1) return '📅 Tomorrow';
  if (diffDays === -1) return '📅 Yesterday';
  if (diffDays < -1) return `📅 ${Math.abs(diffDays)} days ago`;
  return `📅 ${diffDays} days`;
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  showFollowUpDate = false,
  followUpDate,
}) => {
  return (
    <div className="flex flex-col items-end gap-1">
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusColors[status]}`}>
        {status}
      </span>
      {showFollowUpDate && status === 'Follow-up' && followUpDate && (
        <span className="text-xs text-purple-600 font-medium">
          {getFollowUpText(followUpDate)}
        </span>
      )}
    </div>
  );
};
