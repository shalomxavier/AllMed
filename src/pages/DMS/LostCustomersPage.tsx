import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PageContainer } from '@/components/common';
import { ChatHeader, MessageBubble } from '@/components/whatsapp';
import { LostCustomerList } from './components/LostCustomerList';
import { LostCustomerDetail } from './components/LostCustomerDetail';
import { subscribeToLostCustomers } from '@/services/lostCustomerService';
import { subscribeToLostReasonDistribution } from '@/services/analyticsService';
import { subscribeToMessages } from '@/services/whatsapp';
import type { LostCustomer } from './lostCustomerTypes';
import type { LostReasonCount } from '@/services/analyticsService';
import type { WhatsAppMessage } from '@/types/index';

export const LostCustomersPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [showMobileDetail, setShowMobileDetail] = useState(false);
  const [lostCustomers, setLostCustomers] = useState<LostCustomer[]>([]);
  const [lostReasonDistribution, setLostReasonDistribution] = useState<LostReasonCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedCustomer = lostCustomers.find((c) => c.id === selectedCustomerId) || null;

  // Subscribe to lost customers with real-time updates
  useEffect(() => {
    const unsubscribe = subscribeToLostCustomers(
      (customers) => {
        setLostCustomers(customers);
        setLoading(false);
      },
      (error) => {
        console.error('Error loading lost customers:', error);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  // Subscribe to lost reason distribution
  useEffect(() => {
    const unsubscribe = subscribeToLostReasonDistribution(
      (distribution) => {
        setLostReasonDistribution(distribution);
      },
      (error) => {
        console.error('Error loading lost reason distribution:', error);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  // Subscribe to real-time messages for the selected conversation
  useEffect(() => {
    if (!selectedCustomer) {
      setMessages([]);
      return;
    }

    const unsubscribe = subscribeToMessages(
      selectedCustomer.conversationId,
      (updatedMessages) => {
        setMessages(updatedMessages);
      },
      (error) => {
        console.error('[LostCustomersPage] Error loading messages:', error);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [selectedCustomer?.conversationId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current && selectedCustomer) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, selectedCustomer?.conversationId]);

  const handleSelectCustomer = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setShowMobileChat(true);
  };

  const handleBackToList = () => {
    setShowMobileChat(false);
    setShowMobileDetail(false);
  };

  const handleReopenFollowUp = (customerId: string) => {
    // In a real implementation, this would update the enquiry status in Firestore
    console.log('Reopening follow-up for customer:', customerId);
    // For now, just log the action
  };

  return (
    <PageContainer>
      <div className="mt-4 flex items-center gap-3 px-4 py-3 bg-white border-b border-secondary-200">
        <button
          onClick={() => navigate('/dms')}
          className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft size={20} className="text-secondary-600" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-secondary-900">Lost Customers</h1>
        </div>
      </div>

      {/* Lost Reason Summary Cards */}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {lostReasonDistribution.map((item) => (
          <div key={item.reason} className="card p-3 bg-red-50 border border-red-200">
            <p className="text-xs text-red-600 font-medium mb-1 truncate">{item.reason}</p>
            <p className="text-xl font-bold text-red-900">{item.count}</p>
            <p className="text-xs text-red-500">{item.percentage}%</p>
          </div>
        ))}
      </div>

      <div className="mt-6 h-[calc(100vh-320px)] min-h-[500px] flex gap-4">
        {/* Left Panel - Lost Customer List (30%) */}
        <div className={`w-[30%] flex-shrink-0 flex flex-col card overflow-hidden ${showMobileChat ? 'hidden lg:flex' : 'flex'}`}>
          <LostCustomerList
            lostCustomers={lostCustomers}
            selectedCustomerId={selectedCustomerId}
            onSelectCustomer={handleSelectCustomer}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            loading={loading}
          />
        </div>

        {/* Center Panel - WhatsApp Chat (45%) */}
        <div className={`flex-[45%] flex flex-col card overflow-hidden ${showMobileChat ? 'flex' : 'hidden lg:flex'}`}>
          {selectedCustomer ? (
            <>
              <ChatHeader
                contact={{
                  id: selectedCustomer.id,
                  name: selectedCustomer.customerName,
                  phoneNumber: selectedCustomer.customerPhone,
                  lastMessage: 'Conversation ended',
                  lastMessageTime: selectedCustomer.lostDate,
                  unreadCount: 0,
                  isArchived: false,
                  labels: [],
                  deliveryStatus: selectedCustomer.deliveryStatus,
                }}
                onBack={handleBackToList}
                enquiryStatus="Lost"
                lastEnquiryInfo={{
                  status: 'Lost',
                  lostReason: selectedCustomer.lostReason,
                  otherReason: selectedCustomer.customReason,
                  notes: selectedCustomer.internalNotes,
                  updatedAt: selectedCustomer.updatedAt,
                }}
              />

              {/* Messages - Read Only */}
              <div className="flex-1 overflow-y-auto p-4 bg-secondary-50">
                {messages.length === 0 ? (
                  <div className="text-center text-secondary-500 py-8">
                    <p className="text-sm">No messages available</p>
                  </div>
                ) : (
                  messages.map((message) => (
                    <MessageBubble key={message.id} message={message} />
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Read-only indicator (no message input) */}
              <div className="p-4 bg-white border-t border-secondary-200">
                <div className="px-4 py-3 bg-secondary-100 rounded-lg text-secondary-500 text-sm text-center">
                  Read-only conversation - sending messages is disabled
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-secondary-50">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-secondary-100 flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl">👥</span>
                </div>
                <p className="text-secondary-600 font-medium">Select a lost customer</p>
                <p className="text-sm text-secondary-400 mt-1">
                  Choose a customer from the list to view their conversation
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Customer Detail (25%) */}
        <div className="w-[25%] flex-shrink-0 hidden xl:flex flex-col card overflow-hidden">
          {selectedCustomer ? (
            <LostCustomerDetail
              customer={selectedCustomer}
              onReopenFollowUp={handleReopenFollowUp}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-secondary-500">
                <p className="text-sm">No customer selected</p>
              </div>
            </div>
          )}
        </div>

        {/* Mobile Detail Toggle */}
        {selectedCustomer && (
          <div className="xl:hidden fixed bottom-4 right-4 z-10">
            <button
              onClick={() => setShowMobileDetail(!showMobileDetail)}
              className="p-3 bg-green-600 text-white rounded-full shadow-lg hover:bg-green-700 transition-colors"
              aria-label="Toggle enquiry details"
            >
              ℹ️
            </button>
          </div>
        )}

        {/* Mobile Detail Bottom Sheet */}
        {showMobileDetail && selectedCustomer && (
          <div className="xl:hidden fixed inset-0 z-50 bg-black/50 flex items-end">
            <div className="bg-white w-full max-h-[80vh] rounded-t-2xl overflow-hidden flex flex-col">
              <div className="p-4 border-b border-secondary-200 flex items-center justify-between">
                <h3 className="font-semibold text-secondary-900">Enquiry Details</h3>
                <button
                  onClick={() => setShowMobileDetail(false)}
                  className="p-1 rounded hover:bg-secondary-100"
                  aria-label="Close details"
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <LostCustomerDetail
                  customer={selectedCustomer}
                  onReopenFollowUp={handleReopenFollowUp}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  );
};
