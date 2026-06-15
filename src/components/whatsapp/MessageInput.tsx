import { useState, useRef, useCallback } from 'react';
import { Send, Paperclip, Smile, Mic } from 'lucide-react';

interface MessageInputProps {
  onSendMessage: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  disabled = false,
  placeholder = 'Type a message...',
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
    <div className="px-4 py-3 bg-secondary-50 border-t border-secondary-200">
      <div className="flex items-end gap-2">
        {/* Attachment Button */}
        <button
          className="p-2 rounded-full text-secondary-500 hover:text-secondary-700 hover:bg-secondary-200 transition-colors flex-shrink-0"
          aria-label="Attach file"
          title="Attach file"
          disabled={disabled}
        >
          <Paperclip size={20} />
        </button>

        {/* Emoji Button */}
        <button
          className="p-2 rounded-full text-secondary-500 hover:text-secondary-700 hover:bg-secondary-200 transition-colors flex-shrink-0 hidden sm:block"
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
            className="w-full px-4 py-2.5 bg-white border border-secondary-300 rounded-2xl text-secondary-900 placeholder-secondary-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none max-h-32"
            style={{ minHeight: '44px' }}
          />
        </div>

        {/* Send / Record Button */}
        {showSendButton ? (
          <button
            onClick={handleSend}
            disabled={disabled}
            className="p-2.5 rounded-full bg-green-600 text-white hover:bg-green-700 transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Send message"
          >
            <Send size={20} />
          </button>
        ) : (
          <button
            onClick={() => setIsRecording(!isRecording)}
            disabled={disabled}
            className={`p-2.5 rounded-full transition-colors flex-shrink-0 ${
              isRecording 
                ? 'bg-primary-600 text-white' 
                : 'bg-green-600 text-white hover:bg-green-700'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            aria-label={isRecording ? 'Stop recording' : 'Record voice message'}
          >
            <Mic size={20} />
          </button>
        )}
      </div>
    </div>
  );
};
