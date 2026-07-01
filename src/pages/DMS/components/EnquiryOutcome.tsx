import type { LostReason } from '../types';

export interface EnquiryOutcomeData {
  outcome: 'completed' | 'not_completed' | null;
  lostReason?: LostReason;
  otherReason?: string;
  internalNotes?: string;
}

interface EnquiryOutcomeProps {
  data: EnquiryOutcomeData;
  onChange: (data: EnquiryOutcomeData) => void;
}

export const EnquiryOutcome: React.FC<EnquiryOutcomeProps> = ({ data, onChange }) => {
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

  const handleOutcomeChange = (outcome: 'completed' | 'not_completed') => {
    if (outcome === 'completed') {
      onChange({
        outcome: 'completed',
        lostReason: undefined,
        otherReason: undefined,
        internalNotes: data.internalNotes,
      });
    } else {
      onChange({
        outcome: 'not_completed',
        lostReason: data.lostReason,
        otherReason: data.otherReason,
        internalNotes: data.internalNotes,
      });
    }
  };

  const handleLostReasonChange = (reason: LostReason) => {
    onChange({
      ...data,
      lostReason: reason,
      otherReason: reason === 'Other' ? data.otherReason : undefined,
    });
  };

  const handleOtherReasonChange = (value: string) => {
    onChange({
      ...data,
      otherReason: value,
    });
  };

  const handleInternalNotesChange = (value: string) => {
    onChange({
      ...data,
      internalNotes: value,
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-secondary-900 mb-3">Enquiry Outcome</h4>
        
        {/* Outcome Options */}
        <div className="space-y-2">
          <label className="flex items-center gap-3 p-3 border border-secondary-200 rounded-lg cursor-pointer hover:bg-secondary-50 transition-colors">
            <input
              type="radio"
              name="enquiryOutcome"
              checked={data.outcome === 'completed'}
              onChange={() => handleOutcomeChange('completed')}
              className="w-4 h-4 text-green-600 focus:ring-green-500"
            />
            <span className="text-sm font-medium text-secondary-900">Purchase Completed</span>
          </label>

          <label className="flex items-center gap-3 p-3 border border-secondary-200 rounded-lg cursor-pointer hover:bg-secondary-50 transition-colors">
            <input
              type="radio"
              name="enquiryOutcome"
              checked={data.outcome === 'not_completed'}
              onChange={() => handleOutcomeChange('not_completed')}
              className="w-4 h-4 text-red-600 focus:ring-red-500"
            />
            <span className="text-sm font-medium text-secondary-900">Purchase Not Completed</span>
          </label>
        </div>
      </div>

      {/* Purchase Not Completed Details */}
      {data.outcome === 'not_completed' && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1">
              Reason for Not Completing Purchase <span className="text-red-500">*</span>
            </label>
            <select
              value={data.lostReason || ''}
              onChange={(e) => handleLostReasonChange(e.target.value as LostReason)}
              className="w-full px-3 py-2 border border-secondary-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="">Select a reason</option>
              {lostReasons.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
          </div>

          {data.lostReason === 'Other' && (
            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-1">
                Specify Other Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={data.otherReason || ''}
                onChange={(e) => handleOtherReasonChange(e.target.value)}
                placeholder="Please specify the reason..."
                rows={3}
                className="w-full px-3 py-2 border border-secondary-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1">
              Internal Notes <span className="text-secondary-400">(optional)</span>
            </label>
            <textarea
              value={data.internalNotes || ''}
              onChange={(e) => handleInternalNotesChange(e.target.value)}
              placeholder="Add any additional notes..."
              rows={3}
              className="w-full px-3 py-2 border border-secondary-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
            />
          </div>
        </div>
      )}
    </div>
  );
};
