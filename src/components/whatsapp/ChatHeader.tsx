import { useState } from 'react';
import { ArrowLeft, MoreVertical, CheckCircle, XCircle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { WhatsAppContact } from '@/types/index';
import { updateDeliveryStatus } from '@/services/whatsapp';

interface ChatHeaderProps {
  contact: WhatsAppContact;
  isOnline?: boolean;
  onBack?: () => void;
  conversationId?: string;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  contact,
  isOnline = false,
  onBack,
  conversationId
}) => {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [reasonPopupOpen, setReasonPopupOpen] = useState(false);
  const [reason, setReason] = useState('');

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  const handleDelivered = async () => {
    if (conversationId) {
      try {
        await updateDeliveryStatus(conversationId, 'delivered');
        console.log('Marked as delivered');
      } catch (error) {
        console.error('Error updating delivery status:', error);
      }
    }
    setMenuOpen(false);
  };

  const handleNotDelivered = () => {
    setMenuOpen(false);
    setReasonPopupOpen(true);
  };

  const handleReasonSubmit = async () => {
    if (conversationId) {
      try {
        await updateDeliveryStatus(conversationId, 'not_delivered', reason);
        console.log('Not delivered reason:', reason);
      } catch (error) {
        console.error('Error updating delivery status:', error);
      }
    }
    setReasonPopupOpen(false);
    setReason('');
  };

  return (
    <>
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
        <div className="flex items-center gap-1 relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 rounded-lg text-secondary-500 hover:text-secondary-700 hover:bg-secondary-200 transition-colors"
            aria-label="More options"
          >
            <MoreVertical size={18} />
          </button>

          {/* Dropdown Menu */}
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-secondary-200 py-1 z-10 min-w-[160px]">
              <button
                onClick={handleDelivered}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-secondary-700 hover:bg-secondary-50 transition-colors"
              >
                <CheckCircle size={16} className="text-blue-600" />
                Delivered
              </button>
              <button
                onClick={handleNotDelivered}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-secondary-700 hover:bg-secondary-50 transition-colors"
              >
                <XCircle size={16} className="text-red-600" />
                Not Delivered
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Reason Popup */}
      {reasonPopupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-secondary-200">
              <h2 className="text-lg font-semibold text-secondary-900">
                Not Delivered - Reason
              </h2>
              <button
                onClick={() => {
                  setReasonPopupOpen(false);
                  setReason('');
                }}
                className="p-1.5 rounded-lg text-secondary-500 hover:text-secondary-900 hover:bg-secondary-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Enter the reason for not delivered..."
                className="w-full h-32 px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
              />
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => {
                    setReasonPopupOpen(false);
                    setReason('');
                  }}
                  className="px-4 py-2 text-sm font-medium text-secondary-700 bg-white border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReasonSubmit}
                  disabled={!reason.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Submit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
