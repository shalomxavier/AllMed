import { Phone, Building2, User } from 'lucide-react';

interface CustomerInfoCardProps {
  customerName: string;
  phoneNumber: string;
  store: string;
}

export const CustomerInfoCard: React.FC<CustomerInfoCardProps> = ({
  customerName,
  phoneNumber,
  store,
}) => {
  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-secondary-900 mb-4 flex items-center gap-2">
        <User size={16} />
        Customer Information
      </h3>
      <div className="space-y-3">
        <div>
          <p className="text-xs text-secondary-500 mb-1">Customer Name</p>
          <p className="text-sm font-medium text-secondary-900">{customerName}</p>
        </div>
        <div>
          <p className="text-xs text-secondary-500 mb-1">Phone Number</p>
          <div className="flex items-center gap-2">
            <Phone size={14} className="text-secondary-400" />
            <p className="text-sm font-medium text-secondary-900">{phoneNumber}</p>
          </div>
        </div>
        <div>
          <p className="text-xs text-secondary-500 mb-1">Store</p>
          <div className="flex items-center gap-2">
            <Building2 size={14} className="text-secondary-400" />
            <p className="text-sm font-medium text-secondary-900">{store}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
