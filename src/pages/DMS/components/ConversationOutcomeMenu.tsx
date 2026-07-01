import { MoreVertical, CheckCircle, XCircle } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface ConversationOutcomeMenuProps {
  onDelivered: () => void;
  onNotDelivered: () => void;
}

export const ConversationOutcomeMenu: React.FC<ConversationOutcomeMenuProps> = ({
  onDelivered,
  onNotDelivered,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-lg hover:bg-secondary-100 transition-colors"
        aria-label="More options"
      >
        <MoreVertical size={20} className="text-secondary-600" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-secondary-200 z-10 overflow-hidden">
          <button
            onClick={() => {
              onDelivered();
              setIsOpen(false);
            }}
            className="w-full px-4 py-3 text-left text-sm hover:bg-secondary-50 transition-colors flex items-center gap-3"
          >
            <CheckCircle size={16} className="text-green-600" />
            <span className="text-secondary-700">Delivered</span>
          </button>
          <button
            onClick={() => {
              onNotDelivered();
              setIsOpen(false);
            }}
            className="w-full px-4 py-3 text-left text-sm hover:bg-secondary-50 transition-colors flex items-center gap-3"
          >
            <XCircle size={16} className="text-red-600" />
            <span className="text-secondary-700">Not Delivered</span>
          </button>
        </div>
      )}
    </div>
  );
};
