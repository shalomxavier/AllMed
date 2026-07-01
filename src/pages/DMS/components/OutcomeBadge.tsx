import type { EnquiryStatus } from '../types';

interface OutcomeBadgeProps {
  status: EnquiryStatus;
}

export const OutcomeBadge: React.FC<OutcomeBadgeProps> = ({ status }) => {
  const getBadgeStyles = () => {
    switch (status) {
      case 'Converted':
        return 'bg-green-100 text-green-700';
      case 'Lost':
        return 'bg-red-100 text-red-700';
      case 'Follow-up':
        return 'bg-purple-100 text-purple-700';
      case 'In Progress':
        return 'bg-blue-100 text-blue-700';
      case 'New':
        return 'bg-yellow-100 text-yellow-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${getBadgeStyles()}`}>
      {status}
    </span>
  );
};
