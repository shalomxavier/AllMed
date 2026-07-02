import { FileText } from 'lucide-react';

interface InternalNotesProps {
  notes: string;
  onNotesChange: (notes: string) => void;
}

export const InternalNotes: React.FC<InternalNotesProps> = ({
  notes,
  onNotesChange,
}) => {
  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-secondary-900 mb-4 flex items-center gap-2">
        <FileText size={16} />
        Internal Notes
      </h3>
      <div>
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Add internal notes about this enquiry..."
          rows={6}
          className="w-full px-3 py-2 border border-secondary-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
        />
      </div>
    </div>
  );
};
