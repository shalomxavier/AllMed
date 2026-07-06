import { useState, useRef, useEffect } from 'react';
import { Search } from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/common';
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

export const WorkspacePage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
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
    setStatus('New'); // Reset status when switching conversations
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
      <div className="mt-6">
        <PageHeader
          title="Customer Workspace"
          description="Manage customer enquiries received through WhatsApp."
        />
      </div>

      <div className="mt-6 h-[calc(100vh-200px)] min-h-[600px] flex gap-4">
        {/* Left Panel - Conversation List */}
        <div className={`w-80 flex-shrink-0 flex flex-col card overflow-hidden ${showMobileChat ? 'hidden lg:flex' : 'flex'}`}>
          {/* Search and Filters */}
          <div className="p-4 border-b border-secondary-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400" size={18} />
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
                lastEnquiryInfo={lastEnquiryInfo}
              />

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 bg-secondary-50">
                {activeConversation.messages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <MessageInput onSendMessage={handleSendMessage} />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-secondary-50">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-secondary-100 flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl">💬</span>
                </div>
                <p className="text-secondary-600 font-medium">Select a conversation</p>
                <p className="text-sm text-secondary-400 mt-1">
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
