import { LOST_REASONS, type LostReason } from '../constants/LOST_REASONS';

interface LostReasonModalProps {
  isOpen: boolean;
  lostReason: LostReason | '';
  otherReason: string;
  internalNotes: string;
  onLostReasonChange: (reason: LostReason | '') => void;
  onOtherReasonChange: (reason: string) => void;
  onInternalNotesChange: (notes: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export const LostReasonModal: React.FC<LostReasonModalProps> = ({
  isOpen,
  lostReason,
  otherReason,
  internalNotes,
  onLostReasonChange,
  onOtherReasonChange,
  onInternalNotesChange,
  onSave,
  onCancel,
}) => {
  if (!isOpen) return null;

  const isSaveDisabled = !lostReason || (lostReason === 'Other' && !otherReason.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-secondary-900 mb-4">Mark Customer as Lost</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-secondary-700 mb-1">
                Reason <span className="text-red-500">*</span>
              </label>
              <select
                value={lostReason}
                onChange={(e) => onLostReasonChange(e.target.value as LostReason | '')}
                className="w-full px-3 py-2 border border-secondary-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              >
                <option value="">Select a reason</option>
                {LOST_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
            </div>

            {lostReason === 'Other' && (
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  Specify Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={otherReason}
                  onChange={(e) => onOtherReasonChange(e.target.value)}
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
                value={internalNotes}
                onChange={(e) => onInternalNotesChange(e.target.value)}
                placeholder="Add any additional notes..."
                rows={3}
                className="w-full px-3 py-2 border border-secondary-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-secondary-50 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-secondary-700 bg-white border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={isSaveDisabled}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
