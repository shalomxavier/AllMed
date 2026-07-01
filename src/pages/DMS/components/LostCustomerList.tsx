import { Search } from 'lucide-react';
import type { LostCustomer } from '../lostCustomerTypes';

interface LostCustomerListProps {
  lostCustomers: LostCustomer[];
  selectedCustomerId: string | null;
  onSelectCustomer: (customerId: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  loading?: boolean;
}

export const LostCustomerList: React.FC<LostCustomerListProps> = ({
  lostCustomers,
  selectedCustomerId,
  onSelectCustomer,
  searchQuery,
  onSearchChange,
  loading = false,
}) => {
  const filteredCustomers = lostCustomers.filter(
    (customer) =>
      customer.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.customerPhone.includes(searchQuery)
  );

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
      {/* Search Bar */}
      <div className="p-4 border-b border-secondary-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400" size={18} />
          <input
            type="text"
            placeholder="Search lost customers..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-secondary-50 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Customer List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center text-secondary-500">
            <p className="text-sm">Loading lost customers...</p>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="p-8 text-center text-secondary-500">
            <p className="text-sm">No lost customers found</p>
          </div>
        ) : (
          <div className="divide-y divide-secondary-100">
            {filteredCustomers.map((customer) => (
              <div
                key={customer.id}
                onClick={() => onSelectCustomer(customer.id)}
                className={`p-4 cursor-pointer transition-colors hover:bg-secondary-50 ${
                  selectedCustomerId === customer.id ? 'bg-green-50 border-l-4 border-l-green-500' : ''
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-secondary-900 truncate">{customer.customerName}</h3>
                    <p className="text-sm text-secondary-600">{customer.customerPhone}</p>
                  </div>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getLostReasonColor(customer.lostReason)}`}>
                    {customer.lostReason}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-secondary-500">
                  <span>{customer.storeName}</span>
                  <span>{formatDate(customer.lostDate)}</span>
                </div>

                <div className="mt-2">
                  <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded bg-red-100 text-red-700">
                    Lost
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
