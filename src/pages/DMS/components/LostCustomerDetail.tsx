import { Clock, Phone, Store, User, Calendar, AlertCircle, Hash } from 'lucide-react';
import type { LostCustomer } from '../lostCustomerTypes';

interface LostCustomerDetailProps {
  customer: LostCustomer;
  onReopenFollowUp: (customerId: string) => void;
}

export const LostCustomerDetail: React.FC<LostCustomerDetailProps> = ({
  customer,
  onReopenFollowUp,
}) => {
  const getLostReasonColor = (reason: string) => {
    const colors: Record<string, string> = {
      'Price Too High': 'bg-orange-100 text-orange-700',
      'Out of Stock': 'bg-red-100 text-red-700',
      'No Reply From Customer': 'bg-gray-100 text-gray-700',
      'Late Response': 'bg-yellow-100 text-yellow-700',
      'Customer Purchased Elsewhere': 'bg-blue-100 text-blue-700',
      'Prescription Issue': 'bg-purple-100 text-purple-700',
      'Delivery Not Available': 'bg-pink-100 text-pink-700',
      'Other': 'bg-gray-100 text-gray-700',
    };
    return colors[reason] || 'bg-gray-100 text-gray-700';
  };

  const getDeliveryStatusColor = (status?: string | null) => {
    switch (status) {
      case 'delivered':
        return 'bg-green-100 text-green-700';
      case 'not_delivered':
        return 'bg-red-100 text-red-700';
      case 'pending':
        return 'bg-yellow-100 text-yellow-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-secondary-200">
        <h3 className="font-semibold text-secondary-900">Enquiry Details</h3>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Customer Info */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-secondary-500 uppercase tracking-wider">Customer</h4>

          <div className="flex items-center gap-2 text-sm">
            <User size={16} className="text-secondary-500" />
            <span className="text-secondary-600">Customer Name:</span>
            <span className="font-medium text-secondary-900">{customer.customerName}</span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <Phone size={16} className="text-secondary-500" />
            <span className="text-secondary-600">Phone Number:</span>
            <span className="font-medium text-secondary-900">{customer.customerPhone}</span>
          </div>
        </div>

        {/* Store Info */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-secondary-500 uppercase tracking-wider">Store</h4>

          <div className="flex items-center gap-2 text-sm">
            <Store size={16} className="text-secondary-500" />
            <span className="text-secondary-600">Store Name:</span>
            <span className="font-medium text-secondary-900">{customer.storeName}</span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <Phone size={16} className="text-secondary-500" />
            <span className="text-secondary-600">Business Phone:</span>
            <span className="font-medium text-secondary-900">{customer.businessPhoneNumber}</span>
          </div>
        </div>

        {/* Status & Reason */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-secondary-500 uppercase tracking-wider">Status</h4>

          <div className="flex items-center justify-between">
            <span className="text-sm text-secondary-600">Delivery Status</span>
            <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded ${getDeliveryStatusColor(customer.deliveryStatus)}`}>
              {customer.deliveryStatus || 'Unknown'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-secondary-600">Lost Reason</span>
            <span className={`px-2 py-0.5 text-xs font-medium rounded ${getLostReasonColor(customer.lostReason)}`}>
              {customer.lostReason}
            </span>
          </div>

          {customer.customReason && (
            <div className="mt-2">
              <label className="block text-sm font-medium text-secondary-700 mb-1">Custom Reason</label>
              <div className="p-3 bg-secondary-50 rounded-lg text-sm text-secondary-700">
                {customer.customReason}
              </div>
            </div>
          )}

          {customer.internalNotes && (
            <div className="mt-2">
              <label className="block text-sm font-medium text-secondary-700 mb-1">Internal Notes</label>
              <div className="p-3 bg-secondary-50 rounded-lg text-sm text-secondary-700">
                {customer.internalNotes}
              </div>
            </div>
          )}
        </div>

        {/* Dates */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-secondary-500 uppercase tracking-wider">Timeline</h4>

          <div className="flex items-center gap-2 text-sm">
            <Calendar size={16} className="text-secondary-500" />
            <span className="text-secondary-600">Created Date:</span>
            <span className="font-medium text-secondary-900">{formatDate(customer.createdAt)}</span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <AlertCircle size={16} className="text-secondary-500" />
            <span className="text-secondary-600">Last Updated:</span>
            <span className="font-medium text-secondary-900">{formatDate(customer.updatedAt)}</span>
          </div>

          {customer.responseTime && (
            <div className="flex items-center gap-2 text-sm">
              <Clock size={16} className="text-secondary-500" />
              <span className="text-secondary-600">Response Time:</span>
              <span className="font-medium text-secondary-900">{customer.responseTime}</span>
            </div>
          )}
        </div>

        {/* Conversation ID */}
        <div className="pt-2 border-t border-secondary-100">
          <div className="flex items-center gap-2 text-xs text-secondary-400">
            <Hash size={14} />
            <span className="font-mono">{customer.conversationId}</span>
          </div>
        </div>
      </div>

      {/* Action Button */}
      <div className="p-4 border-t border-secondary-200">
        <button
          onClick={() => onReopenFollowUp(customer.id)}
          className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium flex items-center justify-center gap-2"
        >
          <Clock size={16} />
          Reopen Follow-up
        </button>
      </div>
    </div>
  );
};
