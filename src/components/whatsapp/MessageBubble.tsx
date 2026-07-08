import { Check, CheckCheck, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import type { WhatsAppMessage } from '@/types/index';

interface MessageBubbleProps {
  message: WhatsAppMessage;
  showSender?: boolean;
}

const statusIcons = {
  sent: <Check size={14} className="text-secondary-400" />,
  delivered: <CheckCheck size={14} className="text-secondary-400" />,
  read: <CheckCheck size={14} className="text-blue-500" />,
  failed: <AlertCircle size={14} className="text-primary-500" />,
};

const statusLabels = {
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
  failed: 'Failed',
};

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, showSender = false }) => {
  const isOutgoing = !message.isIncoming;
  const formattedTime = format(message.timestamp, 'h:mm a');

  return (
    <div
      className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'} mb-3`}
    >
      <div
        className={`max-w-[75%] lg:max-w-[65%] rounded-2xl px-4 py-2.5 shadow-sm ${
          isOutgoing
            ? 'rounded-br-md'
            : 'rounded-bl-md'
        }`}
        style={isOutgoing ? { background: '#d9fdd3', color: '#111b21' } : { background: '#ffffff', color: '#111b21' }}
      >
        {showSender && message.isIncoming && (
          <p className="text-xs font-medium text-green-600 mb-1">
            {message.senderName || message.senderPhone}
          </p>
        )}

        {/* Media message */}
        {message.type !== 'text' && message.mediaUrl && (
          <div className="mb-2">
            {message.type === 'image' && (
              <img
                src={message.mediaUrl}
                alt={message.caption || 'Image'}
                className="rounded-lg max-w-full max-h-48 object-cover"
              />
            )}
            {message.type === 'video' && (
              <video
                src={message.mediaUrl}
                controls
                className="rounded-lg max-w-full max-h-48"
              />
            )}
            {message.type === 'document' && (
              <div className={`flex items-center gap-2 p-3 rounded-lg ${isOutgoing ? 'bg-green-700' : 'bg-secondary-100'}`}>
                <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold">PDF</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{message.fileName || 'Document'}</p>
                  <p className="text-xs opacity-75">{message.mimeType || 'Application'}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Text content */}
        {message.content && (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        )}

        {/* Caption for media */}
        {message.caption && message.type !== 'text' && (
          <p className="text-sm mt-2 pt-2 border-t border-white/20">{message.caption}</p>
        )}

        {/* Timestamp and status */}
        <div className={`flex items-center justify-end gap-1 mt-1 ${isOutgoing ? 'text-green-700' : 'text-secondary-400'}`}>
          <span className="text-xs">{formattedTime}</span>
          {isOutgoing && (
            <span title={statusLabels[message.status]}>
              {statusIcons[message.status]}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
