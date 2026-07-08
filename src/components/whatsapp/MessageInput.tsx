import { useState, useRef, useCallback } from 'react';
import { Send, Plus, Smile, Mic } from 'lucide-react';

interface MessageInputProps {
  onSendMessage: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  disabled = false,
  placeholder = 'Type a message',
}) => {
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = message.trim();
    if (!trimmed || disabled) return;

    onSendMessage(trimmed);
    setMessage('');
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [message, disabled, onSendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    
    // Auto-resize textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  };

  const showSendButton = message.trim().length > 0;

  return (
    <div className="px-4 py-3">
      <div className="flex items-end gap-2 bg-white rounded-full shadow-sm px-3 py-1">
        {/* Attachment Button */}
        <button
          className="p-2.5 rounded-full text-black hover:bg-secondary-200 transition-colors flex-shrink-0"
          aria-label="Attach file"
          title="Attach file"
          disabled={disabled}
        >
          <Plus size={20} />
        </button>

        {/* Emoji Button */}
        <button
          className="p-2.5 rounded-full text-black hover:bg-secondary-200 transition-colors flex-shrink-0"
          aria-label="Add emoji"
          title="Add emoji"
          disabled={disabled}
        >
          <Smile size={20} />
        </button>

        {/* Message Input */}
        <div className="flex-1 min-w-0">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? 'Sending...' : placeholder}
            disabled={disabled}
            rows={1}
            className="w-full px-2 py-2.5 bg-transparent text-secondary-900 placeholder-secondary-500 focus:outline-none resize-none max-h-32 leading-5"
          />
        </div>

        {/* Send / Record Button */}
        {showSendButton ? (
          <button
            onClick={handleSend}
            disabled={disabled}
            className="p-2.5 rounded-full text-black hover:bg-secondary-200 transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Send message"
          >
            <Send size={20} />
          </button>
        ) : (
          <button
            onClick={() => setIsRecording(!isRecording)}
            disabled={disabled}
            className={`p-2.5 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${
              isRecording
                ? 'text-primary-600 hover:bg-primary-100'
                : 'text-black hover:bg-secondary-200'
            }`}
            aria-label={isRecording ? 'Stop recording' : 'Record voice message'}
          >
            <Mic size={20} />
          </button>
        )}
      </div>
    </div>
  );
};
