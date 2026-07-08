import { useState, useRef, useEffect } from 'react';
import { Search } from 'lucide-react';
import { PageContainer } from '@/components/common';
import { ConversationList, ChatHeader, MessageBubble, MessageInput } from '@/components/whatsapp';
import type { LastEnquiryInfo } from '@/components/whatsapp/ChatHeader';
import { ConfirmationDialog } from './components/ConfirmationDialog';
import { LostReasonModal } from './components/LostReasonModal';
import { useToast } from './components/Toast';
import { useWhatsApp } from '@/hooks/useWhatsApp';
import { updateDeliveryStatus } from '@/services/whatsapp';
import { enquiriesService } from '@/services/firestore/enquiriesService';
import type { EnquiryStatus } from './types';
import type { LostReason as LostReasonType } from './constants/LOST_REASONS';

type ConversationFilter = 'all' | 'unread' | 'not_delivered';

const FILTERS: { key: ConversationFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'not_delivered', label: 'Not Delivered' },
];

export const WorkspacePage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<ConversationFilter>('all');
  const [showMobileChat, setShowMobileChat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Use existing WhatsApp hook for real-time data
  const {
    conversations,
    activeConversation,
    sendMessage,
    selectConversation,
  } = useWhatsApp();

  // Local state for enquiry outcome tracking (minimal)
  const [status, setStatus] = useState<EnquiryStatus>('New');
  const [internalNotes, setInternalNotes] = useState('');
  const [lastEnquiryInfo, setLastEnquiryInfo] = useState<LastEnquiryInfo | null>(null);

  // Conversation outcome modal state
  const [showDeliveredConfirmation, setShowDeliveredConfirmation] = useState(false);
  const [showLostReasonModal, setShowLostReasonModal] = useState(false);
  const [lostReasonModalData, setLostReasonModalData] = useState({
    lostReason: '' as LostReasonType | '',
    otherReason: '',
    internalNotes: '',
  });

  const { showToast, ToastContainer } = useToast();

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeConversation?.messages]);

  // Fetch last recorded enquiry info (lost reason / internal notes) for the active conversation
  useEffect(() => {
    if (!activeConversation) {
      setLastEnquiryInfo(null);
      return;
    }

    let cancelled = false;

    enquiriesService
      .getEnquiryByConversationId(activeConversation.id)
      .then((enquiry) => {
        if (cancelled) return;
        if (enquiry) {
          setLastEnquiryInfo({
            status: enquiry.status,
            lostReason: enquiry.lostReason,
            otherReason: enquiry.otherReason,
            notes: enquiry.notes,
            updatedAt: enquiry.updatedAt,
          });
        } else {
          setLastEnquiryInfo(null);
        }
      })
      .catch((err) => {
        console.error('Error fetching last enquiry info:', err);
        if (!cancelled) setLastEnquiryInfo(null);
      });

    return () => {
      cancelled = true;
    };
  }, [activeConversation?.id]);

  // Filter conversations based on search and active filter bubble
  const filteredConversations = conversations.filter((conv) => {
    const searchLower = searchQuery.toLowerCase();
    const nameMatch = conv.contact.name?.toLowerCase().includes(searchLower) ?? false;
    const phoneMatch = conv.contact.phoneNumber.includes(searchQuery);
    const messageMatch = conv.contact.lastMessage?.toLowerCase().includes(searchLower) ?? false;
    const matchesSearch = nameMatch || phoneMatch || messageMatch;

    let matchesFilter = true;
    if (activeFilter === 'unread') {
      matchesFilter = conv.contact.unreadCount > 0;
    } else if (activeFilter === 'not_delivered') {
      matchesFilter = conv.contact.deliveryStatus === 'not_delivered';
    }

    return matchesSearch && matchesFilter;
  });

  const handleSelectConversation = (conversationId: string) => {
    const conv = conversations.find((c) => c.id === conversationId);
    const deliveryStatus = conv?.contact?.deliveryStatus;
    if (deliveryStatus === 'delivered') {
      setStatus('Converted');
    } else if (deliveryStatus === 'not_delivered') {
      setStatus('Lost');
    } else {
      setStatus('New');
    }
    selectConversation(conversationId);
    setShowMobileChat(true);
  };

  const handleBackToList = () => {
    setShowMobileChat(false);
  };

  const handleSendMessage = async (content: string) => {
    await sendMessage(content);
  };

  // Conversation outcome handlers
  const handleDeliveredClick = () => {
    setShowDeliveredConfirmation(true);
  };

  const handleDeliveredConfirm = async () => {
    if (!activeConversation) return;
    
    setShowDeliveredConfirmation(false);
    setStatus('Converted');
    
    // Update delivery status via existing service
    try {
      await updateDeliveryStatus(activeConversation.id, 'delivered');
      showToast('success', 'Customer marked as Converted');
    } catch (err) {
      console.error('Error updating delivery status:', err);
      showToast('error', 'Failed to update status');
    }
  };

  const handleActiveEnquiry = async () => {
    if (!activeConversation) return;
    setStatus('New');
    setLastEnquiryInfo(null);
    try {
      await updateDeliveryStatus(activeConversation.id, 'pending');
      showToast('success', 'Customer marked as Active Enquiry');
    } catch (err) {
      console.error('Error updating delivery status:', err);
      showToast('error', 'Failed to update status');
    }
  };

  const handleNotDeliveredClick = () => {
    setShowLostReasonModal(true);
    setLostReasonModalData({
      lostReason: '',
      otherReason: '',
      internalNotes: internalNotes,
    });
  };

  const handleLostReasonSave = async () => {
    if (!activeConversation) return;

    setShowLostReasonModal(false);
    setStatus('Lost');
    setInternalNotes(lostReasonModalData.internalNotes);

    // Update delivery status via existing service
    try {
      await updateDeliveryStatus(
        activeConversation.id,
        'not_delivered',
        lostReasonModalData.lostReason === 'Other' ? lostReasonModalData.otherReason : lostReasonModalData.lostReason
      );

      // Save internal notes to enquiries collection
      try {
        const enquiry = await enquiriesService.getEnquiryByConversationId(activeConversation.id);
        if (enquiry) {
          await enquiriesService.updateEnquiry(enquiry.enquiryId, {
            status: 'Lost',
            lostReason: lostReasonModalData.lostReason as LostReasonType,
            otherReason: lostReasonModalData.otherReason,
            notes: lostReasonModalData.internalNotes,
          });
        } else {
          // Create enquiry if it doesn't exist
          await enquiriesService.createEnquiry({
            conversationId: activeConversation.id,
            status: 'Lost',
            lostReason: lostReasonModalData.lostReason as LostReasonType,
            otherReason: lostReasonModalData.otherReason,
            notes: lostReasonModalData.internalNotes,
          });
        }

        setLastEnquiryInfo({
          status: 'Lost',
          lostReason: lostReasonModalData.lostReason as LostReasonType,
          otherReason: lostReasonModalData.otherReason,
          notes: lostReasonModalData.internalNotes,
          updatedAt: new Date(),
        });
      } catch (err) {
        console.error('Error saving lost reason / internal notes:', err);
      }

      showToast('success', 'Customer marked as Lost');
    } catch (err) {
      console.error('Error updating delivery status:', err);
      showToast('error', 'Failed to update status');
    }
  };

  return (
    <PageContainer>
      <div className="h-[calc(100vh-200px)] min-h-[600px] flex gap-4">
        {/* Left Panel - Conversation List */}
        <div className={`w-80 flex-shrink-0 flex flex-col card overflow-hidden ${showMobileChat ? 'hidden lg:flex' : 'flex'}`}>
          {/* Header, Search and Filters */}
          <div className="p-4 border-b bg-white" style={{ borderColor: '#e9edef' }}>
            <h2 className="text-xl font-semibold text-green-600 mb-3">WhatsApp</h2>

            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400" size={18} />
              <input
                type="text"
                placeholder="Search or start new chat"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                style={{ background: '#f6f5f4' }}
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto">
              {FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  onClick={() => setActiveFilter(filter.key)}
                  className={`px-3 py-1 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                    activeFilter === filter.key
                      ? 'bg-green-100 text-green-700 border border-green-200'
                      : 'bg-white text-secondary-600 border border-secondary-300 hover:bg-secondary-100'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {/* Conversation List */}
          <div
            className="flex-1 overflow-y-auto"
            style={{
              backgroundColor: '#efeae2',
              backgroundImage: "url('/chat-bg.jpg')",
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            <ConversationList
              conversations={filteredConversations}
              activeConversationId={activeConversation?.id || null}
              onSelectConversation={handleSelectConversation}
            />
          </div>
        </div>

        {/* Center Panel - Chat */}
        <div className={`flex-1 flex flex-col card overflow-hidden ${showMobileChat ? 'flex' : 'hidden lg:flex'}`}>
          {activeConversation ? (
            <>
              <ChatHeader
                contact={activeConversation.contact}
                onBack={handleBackToList}
                enquiryStatus={status}
                onDelivered={handleDeliveredClick}
                onNotDelivered={handleNotDeliveredClick}
                onActiveEnquiry={handleActiveEnquiry}
                lastEnquiryInfo={lastEnquiryInfo}
              />

              {/* Messages + Input */}
              <div
                className="flex-1 flex flex-col overflow-hidden"
                style={{
                  backgroundColor: '#efeae2',
                  backgroundImage: "url('/whatsapp-bg.png')",
                  backgroundRepeat: 'repeat',
                }}
              >
                <div className="flex-1 overflow-y-auto p-4">
                  {activeConversation.messages.map((message) => (
                    <MessageBubble key={message.id} message={message} />
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                <MessageInput onSendMessage={handleSendMessage} />
              </div>
            </>
          ) : (
            <div
              className="flex-1 flex items-center justify-center bg-secondary-50"
              style={{
                backgroundImage: "url('/whatsapp-bg.png')",
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-secondary-100 flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl">💬</span>
                </div>
                <p className="text-secondary-600 font-medium">Select a conversation</p>
                <p className="text-sm text-secondary-600 mt-1">
                  Choose a conversation from the list to start chatting
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <ConfirmationDialog
        isOpen={showDeliveredConfirmation}
        title="Mark Customer as Converted"
        message="Has the customer successfully completed the purchase?"
        onConfirm={handleDeliveredConfirm}
        onCancel={() => setShowDeliveredConfirmation(false)}
      />

      <LostReasonModal
        isOpen={showLostReasonModal}
        lostReason={lostReasonModalData.lostReason}
        otherReason={lostReasonModalData.otherReason}
        internalNotes={lostReasonModalData.internalNotes}
        onLostReasonChange={(reason) => setLostReasonModalData({ ...lostReasonModalData, lostReason: reason })}
        onOtherReasonChange={(reason) => setLostReasonModalData({ ...lostReasonModalData, otherReason: reason })}
        onInternalNotesChange={(notes) => setLostReasonModalData({ ...lostReasonModalData, internalNotes: notes })}
        onSave={handleLostReasonSave}
        onCancel={() => setShowLostReasonModal(false)}
      />

      {/* Toast Container */}
      <ToastContainer />
    </PageContainer>
  );
};
