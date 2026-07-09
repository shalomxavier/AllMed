import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, MessageSquare, Search, Plus, RefreshCw, AlertCircle, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWhatsApp } from '@/hooks/useWhatsApp';
import { ConversationList, ChatHeader, MessageBubble, MessageInput } from '@/components/whatsapp';
import { format } from 'date-fns';
import { useAuthContext } from '@/contexts/AuthContext';

export const WhatsAppEnquiryPage: React.FC = () => {
  const navigate = useNavigate();
  const { userData, logout } = useAuthContext();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMobileChat, setShowMobileChat] = useState(false);
  const isWhatsAppMessager = userData?.designation === 'WhatsApp Messager';

  const {
    conversations,
    activeConversation,
    loading,
    error,
    sendMessage,
    selectConversation,
    refreshConversations,
  } = useWhatsApp();

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeConversation?.messages]);

  // Filter conversations based on search
  const filteredConversations = conversations.filter((conv) => {
    const searchLower = searchQuery.toLowerCase();
    const nameMatch = conv.contact.name?.toLowerCase().includes(searchLower);
    const phoneMatch = conv.contact.phoneNumber.includes(searchQuery);
    const messageMatch = conv.contact.lastMessage?.toLowerCase().includes(searchLower);
    return nameMatch || phoneMatch || messageMatch;
  });

  const handleSelectConversation = (conversationId: string) => {
    selectConversation(conversationId);
    setShowMobileChat(true);
  };

  const handleBackToList = () => {
    setShowMobileChat(false);
  };

  const handleSendMessage = async (content: string) => {
    await sendMessage(content);
  };

  // Group messages by date
  const groupMessagesByDate = () => {
    if (!activeConversation) return [];

    const groups: { date: Date; messages: typeof activeConversation.messages }[] = [];
    let currentGroup: { date: Date; messages: typeof activeConversation.messages } | null = null;

    activeConversation.messages.forEach((message) => {
      const messageDate = new Date(message.timestamp);
      messageDate.setHours(0, 0, 0, 0);

      if (!currentGroup || currentGroup.date.getTime() !== messageDate.getTime()) {
        currentGroup = { date: messageDate, messages: [] };
        groups.push(currentGroup);
      }
      currentGroup.messages.push(message);
    });

    return groups;
  };

  const messageGroups = groupMessagesByDate();

  return (
    <div className={`${isWhatsAppMessager ? 'h-screen' : 'h-[calc(100vh-80px)]'} flex flex-col`}>
      {/* Page Header - Desktop */}
      {!isWhatsAppMessager && (
        <div className="hidden lg:flex items-center justify-between px-6 py-4 border-b border-secondary-200 bg-white">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/dms')}
              className="p-1.5 rounded-lg text-secondary-500 hover:text-secondary-900 hover:bg-secondary-100 transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-secondary-900">WhatsApp Enquiry Tracker</h1>
              <p className="text-sm text-secondary-500">
                Manage customer enquiries via WhatsApp Business
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshConversations}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-secondary-700 bg-white border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
            <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors">
              <Plus size={16} />
              New Chat
            </button>
          </div>
        </div>
      )}

      {/* WhatsApp Messager Header - Full screen WhatsApp-like experience */}
      {isWhatsAppMessager && (
        <div className="hidden lg:flex items-center justify-between px-4 py-3 border-b border-secondary-200 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-green-600">WhatsApp</h1>
              <p className="text-xs text-secondary-500">Business Messenger</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-secondary-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      )}

      {/* Mobile Header */}
      <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-secondary-200 bg-white">
        <div className="flex items-center gap-3">
          {showMobileChat ? (
            <button
              onClick={handleBackToList}
              className="p-1.5 -ml-1.5 rounded-lg text-secondary-500 hover:text-secondary-900 hover:bg-secondary-100 transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
          ) : (
            <>
              {isWhatsAppMessager ? (
                <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-white" />
                </div>
              ) : (
                <button
                  onClick={() => navigate('/dms')}
                  className="p-1.5 -ml-1.5 rounded-lg text-secondary-500 hover:text-secondary-900 hover:bg-secondary-100 transition-colors"
                >
                  <ArrowLeft size={20} />
                </button>
              )}
            </>
          )}
          <h1 className="font-semibold text-secondary-900">WhatsApp</h1>
        </div>
        <div className="flex items-center gap-2">
          {!showMobileChat && (
            <button
              onClick={refreshConversations}
              className="p-2 rounded-lg text-secondary-500 hover:text-secondary-700 hover:bg-secondary-100 transition-colors"
            >
              <RefreshCw size={18} />
            </button>
          )}
          {isWhatsAppMessager && (
            <button
              onClick={logout}
              className="p-2 rounded-lg text-secondary-500 hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden bg-secondary-50">
        {/* Conversations Sidebar */}
        <div
          className={`w-full lg:w-80 xl:w-96 bg-white border-r border-secondary-200 flex flex-col ${
            showMobileChat ? 'hidden lg:flex' : 'flex'
          }`}
        >
          {/* Search */}
          <div className="p-4 border-b border-secondary-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-400" />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-secondary-50 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto">
            <ConversationList
              conversations={filteredConversations}
              activeConversationId={activeConversation?.id || null}
              onSelectConversation={handleSelectConversation}
            />
          </div>

          {/* Quick Stats */}
          <div className="p-4 border-t border-secondary-200 bg-secondary-50">
            <div className="flex items-center justify-between text-sm">
              <span className="text-secondary-500">
                {conversations.length} conversations
              </span>
              <span className="text-green-600 font-medium">
                {conversations.reduce((acc, c) => acc + c.contact.unreadCount, 0)} unread
              </span>
            </div>
          </div>
        </div>

        {/* Chat Area */}
        <div
          className={`flex-1 flex flex-col bg-[#e5ddd5] ${
            showMobileChat ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {activeConversation ? (
            <>
              {/* Chat Header */}
              <ChatHeader
                contact={activeConversation.contact}
                onBack={handleBackToList}
              />

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4">
                {messageGroups.map((group, groupIndex) => (
                  <div key={groupIndex}>
                    {/* Date Divider */}
                    <div className="flex justify-center mb-4">
                      <span className="px-3 py-1 text-xs font-medium text-secondary-500 bg-secondary-100/80 rounded-full">
                        {format(group.date, 'MMMM d, yyyy')}
                      </span>
                    </div>

                    {/* Messages in this group */}
                    <div className="space-y-1">
                      {group.messages.map((message, msgIndex) => (
                        <MessageBubble
                          key={message.id}
                          message={message}
                          showSender={
                            message.isIncoming &&
                            (msgIndex === 0 ||
                              group.messages[msgIndex - 1].senderId !== message.senderId)
                          }
                        />
                      ))}
                    </div>
                  </div>
                ))}

                {/* Loading indicator */}
                {loading && (
                  <div className="flex justify-center py-4">
                    <div className="flex items-center gap-2 text-sm text-secondary-500">
                      <div className="w-4 h-4 border-2 border-secondary-300 border-t-green-600 rounded-full animate-spin" />
                      Sending...
                    </div>
                  </div>
                )}

                {/* Error display */}
                {error && (
                  <div className="flex justify-center py-4">
                    <div className="flex items-center gap-2 px-4 py-2 bg-primary-50 border border-primary-200 rounded-lg text-sm text-primary-700">
                      <AlertCircle size={16} />
                      {error}
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <MessageInput
                onSendMessage={handleSendMessage}
                disabled={loading}
                placeholder="Type a message..."
              />
            </>
          ) : (
            /* Empty State */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-4">
                <MessageSquare className="w-10 h-10 text-green-600" />
              </div>
              <h3 className="text-lg font-medium text-secondary-900 mb-2">
                Select a conversation
              </h3>
              <p className="text-sm text-secondary-500 max-w-sm">
                Choose a conversation from the sidebar to view messages and respond to customer enquiries.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
