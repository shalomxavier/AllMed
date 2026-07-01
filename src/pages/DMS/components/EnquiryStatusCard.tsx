import { Tag } from 'lucide-react';
import type { EnquiryStatus } from '../types';

interface EnquiryStatusCardProps {
  status: EnquiryStatus;
  onStatusChange: (status: EnquiryStatus) => void;
}

const statusColors: Record<EnquiryStatus, string> = {
  'New': 'bg-blue-100 text-blue-700',
  'In Progress': 'bg-orange-100 text-orange-700',
  'Converted': 'bg-green-100 text-green-700',
  'Lost': 'bg-red-100 text-red-700',
  'Follow-up': 'bg-purple-100 text-purple-700',
};

export const EnquiryStatusCard: React.FC<EnquiryStatusCardProps> = ({
  status,
  onStatusChange,
}) => {
  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-secondary-900 mb-4 flex items-center gap-2">
        <Tag size={16} />
        Enquiry Status
      </h3>
      <div>
        <label className="block text-xs text-secondary-500 mb-2">Status</label>
        <select
          value={status}
          onChange={(e) => onStatusChange(e.target.value as EnquiryStatus)}
          className="w-full px-3 py-2 border border-secondary-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        >
          <option value="New">New</option>
          <option value="In Progress">In Progress</option>
          <option value="Converted">Converted</option>
          <option value="Lost">Lost</option>
          <option value="Follow-up">Follow-up</option>
        </select>
        <div className="mt-3">
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[status]}`}>
            {status}
          </span>
        </div>
      </div>
    </div>
  );
};
