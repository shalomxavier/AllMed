import type { WhatsAppConversation } from '@/types/index';
import { StatusBadge } from '@/pages/DMS/components/StatusBadge';
import type { EnquiryStatus } from '@/pages/DMS/types';

interface ConversationListProps {
  conversations: WhatsAppConversation[];
  activeConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  enquiryStatuses?: Record<string, EnquiryStatus>;
  followUpDates?: Record<string, Date>;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  enquiryStatuses = {},
  followUpDates = {},
}) => {
  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 px-4 text-center">
        <div className="w-16 h-16 rounded-full bg-secondary-100 flex items-center justify-center mb-3">
          <span className="text-2xl">💬</span>
        </div>
        <p className="text-secondary-600 font-medium">No conversations yet</p>
        <p className="text-sm text-secondary-400 mt-1">
          Messages from customers will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-secondary-100">
      {conversations.map((conversation) => {
        const { contact, id } = conversation;
        const isActive = id === activeConversationId;
        const hasUnread = contact.unreadCount > 0;
        const deliveryStatus = contact.deliveryStatus;

        // Determine background color based on priority: unread > delivery status
        let bgClass = 'bg-white';
        let borderClass = 'border-transparent';

        if (hasUnread) {
          bgClass = 'bg-green-100';
          borderClass = 'border-green-600';
        } else if (deliveryStatus === 'delivered') {
          bgClass = 'bg-blue-100';
          borderClass = 'border-blue-600';
        } else if (deliveryStatus === 'not_delivered') {
          bgClass = 'bg-red-100';
          borderClass = 'border-red-600';
        } else if (deliveryStatus === 'pending' || deliveryStatus === null) {
          bgClass = 'bg-yellow-100';
          borderClass = 'border-yellow-600';
        }

        // Active state: keep delivery status color but add ring
        const ringColorMap: Record<string, string> = {
          'border-green-600': 'ring-green-500',
          'border-blue-600': 'ring-blue-500',
          'border-red-600': 'ring-red-500',
          'border-yellow-600': 'ring-yellow-500',
          'border-transparent': 'ring-green-500',
        };
        const activeRing = isActive ? `ring-1 ${ringColorMap[borderClass] || 'ring-green-500'} ring-inset` : '';

        return (
          <button
            key={id}
            onClick={() => onSelectConversation(id)}
            className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left ${bgClass} hover:opacity-80 ${activeRing}`}
          >
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              {contact.profilePicture ? (
                <img
                  src={contact.profilePicture}
                  alt={contact.name || contact.phoneNumber}
                  className="w-12 h-12 rounded-full object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                  <span className="text-green-700 font-semibold">
                    {(contact.name || contact.phoneNumber).charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              {hasUnread && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-green-600 rounded-full flex items-center justify-center text-white text-xs font-medium">
                  {contact.unreadCount > 9 ? '9+' : contact.unreadCount}
                </span>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h4 className={`font-medium truncate ${hasUnread ? 'text-secondary-900' : 'text-secondary-700'}`}>
                  {contact.name || contact.phoneNumber}
                </h4>
                <StatusBadge
                  status={enquiryStatuses[id] || 'New'}
                  showFollowUpDate={true}
                  followUpDate={followUpDates[id]}
                />
              </div>

              <div className="flex items-center gap-2 mt-0.5">
                <p className={`text-sm truncate flex-1 ${hasUnread ? 'text-secondary-900 font-medium' : 'text-secondary-700'}`}>
                  {contact.lastMessage || 'No messages yet'}
                </p>
              </div>

              {/* Labels */}
              {contact.labels.length > 0 && (
                <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                  {contact.labels.slice(0, 3).map((label) => (
                    <span
                      key={label}
                      className="px-1.5 py-0.5 text-xs rounded bg-secondary-100 text-secondary-600 capitalize"
                    >
                      {label}
                    </span>
                  ))}
                  {contact.labels.length > 3 && (
                    <span className="text-xs text-secondary-400">
                      +{contact.labels.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};
