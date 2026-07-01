import { AlertCircle } from 'lucide-react';
import type { LostReason } from '../types';

interface LostReasonSectionProps {
  lostReason: LostReason | undefined;
  otherReason: string;
  onLostReasonChange: (reason: LostReason) => void;
  onOtherReasonChange: (reason: string) => void;
}

export const LostReasonSection: React.FC<LostReasonSectionProps> = ({
  lostReason,
  otherReason,
  onLostReasonChange,
  onOtherReasonChange,
}) => {
  const lostReasons: LostReason[] = [
    'Out of Stock',
    'Price Too High',
    'No Reply From Customer',
    'Late Response',
    'Customer Purchased Elsewhere',
    'Prescription Issue',
    'Delivery Not Available',
    'Other',
  ];

  return (
    <div className="card p-4 border-l-4 border-l-red-500">
      <h3 className="text-sm font-semibold text-secondary-900 mb-4 flex items-center gap-2">
        <AlertCircle size={16} className="text-red-600" />
        Lost Reason
      </h3>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-secondary-500 mb-2">Reason for Lost Enquiry</label>
          <select
            value={lostReason || ''}
            onChange={(e) => onLostReasonChange(e.target.value as LostReason)}
            className="w-full px-3 py-2 border border-secondary-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
          >
            <option value="">Select a reason</option>
            {lostReasons.map((reason) => (
              <option key={reason} value={reason}>
                {reason}
              </option>
            ))}
          </select>
        </div>
        {lostReason === 'Other' && (
          <div>
            <label className="block text-xs text-secondary-500 mb-2">Specify Reason</label>
            <textarea
              value={otherReason}
              onChange={(e) => onOtherReasonChange(e.target.value)}
              placeholder="Please specify the reason..."
              rows={3}
              className="w-full px-3 py-2 border border-secondary-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
            />
          </div>
        )}
      </div>
    </div>
  );
};
