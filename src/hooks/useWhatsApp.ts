import { useState, useEffect, useCallback } from 'react';
import type { WhatsAppMessage, WhatsAppConversation } from '@/types/index';
import {
  subscribeToConversations,
  subscribeToMessages,
  sendWhatsAppMessage,
  markConversationRead,
} from '@/services/whatsapp';

interface UseWhatsAppReturn {
  conversations: WhatsAppConversation[];
  activeConversation: WhatsAppConversation | null;
  messages: WhatsAppMessage[];
  loading: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
  selectConversation: (conversationId: string) => void;
  refreshConversations: () => void;
  markAsRead: (conversationId: string) => void;
  isSubscribed: boolean;
}

export const useWhatsApp = (): UseWhatsAppReturn => {
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);

  // Subscribe to conversations (real-time updates)
  useEffect(() => {
    setIsSubscribed(false);
    
    const unsubscribe = subscribeToConversations(
      (updatedConversations) => {
        setConversations(updatedConversations);
        setIsSubscribed(true);
      },
      (err) => {
        console.error('Subscription error:', err);
        setError('Failed to connect to messaging service');
        setIsSubscribed(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  // Subscribe to messages for active conversation
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }

    const unsubscribe = subscribeToMessages(
      activeConversationId,
      (updatedMessages) => {
        setMessages(updatedMessages);
      },
      (err) => {
        console.error('Messages subscription error:', err);
        setError('Failed to load messages');
      }
    );

    return () => {
      unsubscribe();
    };
  }, [activeConversationId]);

  // Get active conversation with merged messages
  const activeConversation = activeConversationId
    ? conversations.find((c) => c.id === activeConversationId) || null
    : null;

  // Merge conversation with real-time messages
  const activeConversationWithMessages = activeConversation
    ? { ...activeConversation, messages }
    : null;

  const sendMessage = useCallback(
    async (content: string): Promise<void> => {
      if (!activeConversation) {
        setError('No active conversation selected');
        return;
      }

      setLoading(true);
      setError(null);

      try {
        await sendWhatsAppMessage(
          activeConversation.contact.phoneNumber,
          content,
          activeConversation.id
        );
        // Message will appear via real-time subscription
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
        setError(errorMessage);
        console.error('Error sending message:', err);
      } finally {
        setLoading(false);
      }
    },
    [activeConversation]
  );

  const selectConversation = useCallback(
    async (conversationId: string): Promise<void> => {
      setActiveConversationId(conversationId);
      setMessages([]); // Clear messages while loading
      
      // Mark as read via API
      try {
        await markConversationRead(conversationId);
      } catch (err) {
        console.error('Error marking conversation as read:', err);
      }
    },
    []
  );

  const markAsRead = useCallback(
    async (conversationId: string): Promise<void> => {
      // Optimistic update
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === conversationId
            ? { ...conv, contact: { ...conv.contact, unreadCount: 0 } }
            : conv
        )
      );

      // API call
      try {
        await markConversationRead(conversationId);
      } catch (err) {
        console.error('Error marking as read:', err);
      }
    },
    []
  );

  const refreshConversations = useCallback((): void => {
    // Re-subscription happens automatically via useEffect
    setIsSubscribed(false);
    setError(null);
  }, []);

  return {
    conversations,
    activeConversation: activeConversationWithMessages,
    messages,
    loading,
    error,
    sendMessage,
    selectConversation,
    refreshConversations,
    markAsRead,
    isSubscribed,
  };
};
