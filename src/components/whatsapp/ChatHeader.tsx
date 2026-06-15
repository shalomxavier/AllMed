import { ArrowLeft, MoreVertical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { WhatsAppContact } from '@/types/index';

interface ChatHeaderProps {
  contact: WhatsAppContact;
  isOnline?: boolean;
  onBack?: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({ 
  contact, 
  isOnline = false,
  onBack 
}) => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-secondary-50 border-b border-secondary-200">
      <div className="flex items-center gap-3">
        <button
          onClick={handleBack}
          className="p-1.5 -ml-1.5 rounded-lg text-secondary-500 hover:text-secondary-900 hover:bg-secondary-200 transition-colors lg:hidden"
          aria-label="Go back"
        >
          <ArrowLeft size={20} />
        </button>

        {/* Avatar */}
        <div className="relative">
          {contact.profilePicture ? (
            <img
              src={contact.profilePicture}
              alt={contact.name || contact.phoneNumber}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <span className="text-green-700 font-semibold text-sm">
                {(contact.name || contact.phoneNumber).charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          {isOnline && (
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full" />
          )}
        </div>

        {/* Contact Info */}
        <div className="min-w-0">
          <h3 className="font-semibold text-secondary-900 truncate">
            {contact.name || contact.phoneNumber}
          </h3>
          <p className="text-xs text-secondary-500">
            {isOnline ? 'Online' : contact.phoneNumber}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <button
          className="p-2 rounded-lg text-secondary-500 hover:text-secondary-700 hover:bg-secondary-200 transition-colors"
          aria-label="More options"
        >
          <MoreVertical size={18} />
        </button>
      </div>
    </div>
  );
};
