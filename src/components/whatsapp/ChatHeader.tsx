import { useState } from 'react';
import { ArrowLeft, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { WhatsAppContact } from '@/types/index';
import { ConversationOutcomeMenu } from '@/pages/DMS/components/ConversationOutcomeMenu';
import type { EnquiryStatus, LostReason } from '@/pages/DMS/types';

export interface LastEnquiryInfo {
  status: EnquiryStatus;
  lostReason?: LostReason;
  otherReason?: string;
  notes?: string;
  updatedAt?: Date;
}

interface ChatHeaderProps {
  contact: WhatsAppContact;
  isOnline?: boolean;
  onBack?: () => void;
  enquiryStatus?: EnquiryStatus;
  onDelivered?: () => void;
  onNotDelivered?: () => void;
  lastEnquiryInfo?: LastEnquiryInfo | null;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  contact,
  isOnline = false,
  onBack,
  onDelivered,
  onNotDelivered,
  lastEnquiryInfo,
}) => {
  const navigate = useNavigate();
  const [showInfoPopover, setShowInfoPopover] = useState(false);

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

        {/* Info Button */}
        <div className="relative">
          <button
            onClick={() => setShowInfoPopover((prev) => !prev)}
            className="p-1.5 rounded-full text-secondary-500 hover:text-secondary-900 hover:bg-secondary-200 transition-colors"
            aria-label="View last enquiry status"
          >
            <Info size={18} />
          </button>

          {showInfoPopover && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowInfoPopover(false)}
              />
              <div className="absolute left-0 top-full mt-2 w-72 bg-white border border-secondary-200 rounded-lg shadow-lg z-20 p-4">
                <h4 className="text-sm font-semibold text-secondary-900 mb-2">Last Enquiry Status</h4>
                {lastEnquiryInfo ? (
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-secondary-500">Status:</span>
                      <span className="font-medium text-secondary-900">{lastEnquiryInfo.status}</span>
                    </div>
                    {lastEnquiryInfo.lostReason && (
                      <div className="flex justify-between">
                        <span className="text-secondary-500">Lost Reason:</span>
                        <span className="font-medium text-secondary-900">{lastEnquiryInfo.lostReason}</span>
                      </div>
                    )}
                    {lastEnquiryInfo.lostReason === 'Other' && lastEnquiryInfo.otherReason && (
                      <div>
                        <span className="text-secondary-500 block">Specified Reason:</span>
                        <span className="font-medium text-secondary-900">{lastEnquiryInfo.otherReason}</span>
                      </div>
                    )}
                    {lastEnquiryInfo.notes && (
                      <div>
                        <span className="text-secondary-500 block">Internal Notes:</span>
                        <span className="font-medium text-secondary-900 whitespace-pre-wrap">{lastEnquiryInfo.notes}</span>
                      </div>
                    )}
                    {lastEnquiryInfo.updatedAt && (
                      <div className="flex justify-between pt-1 border-t border-secondary-100 mt-1">
                        <span className="text-secondary-500">Updated:</span>
                        <span className="font-medium text-secondary-900">
                          {new Date(lastEnquiryInfo.updatedAt).toLocaleString()}
                        </span>
                      </div>
                    )}
                    {!lastEnquiryInfo.lostReason && !lastEnquiryInfo.notes && (
                      <p className="text-secondary-400 italic">No prior lost-reason history recorded.</p>
                    )}
                  </div>
                ) : (
                  <p className="text-secondary-400 italic text-sm">No prior enquiry status recorded for this customer yet.</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      {onDelivered && onNotDelivered && (
        <ConversationOutcomeMenu
          onDelivered={onDelivered}
          onNotDelivered={onNotDelivered}
        />
      )}
    </div>
  );
};
