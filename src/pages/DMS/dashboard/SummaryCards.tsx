import { Users, UserCheck, UserX, Calendar, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { DashboardStats } from './types';

interface SummaryCardsProps {
  stats: DashboardStats;
}

const cardConfig = [
  {
    key: 'totalConversations',
    label: 'Total Conversations',
    icon: Users,
    color: 'blue',
    bgColor: 'bg-blue-50',
    iconColor: 'text-blue-600',
    borderColor: 'border-blue-200',
  },
  {
    key: 'activeConversations',
    label: 'Active Conversations',
    icon: Users,
    color: 'indigo',
    bgColor: 'bg-indigo-50',
    iconColor: 'text-indigo-600',
    borderColor: 'border-indigo-200',
  },
  {
    key: 'deliveredCustomers',
    label: 'Delivered Customers',
    icon: UserCheck,
    color: 'green',
    bgColor: 'bg-green-50',
    iconColor: 'text-green-600',
    borderColor: 'border-green-200',
  },
  {
    key: 'lostCustomers',
    label: 'Lost Customers',
    icon: UserX,
    color: 'red',
    bgColor: 'bg-red-50',
    iconColor: 'text-red-600',
    borderColor: 'border-red-200',
  },
  {
    key: 'pendingCustomers',
    label: 'Pending Customers',
    icon: Calendar,
    color: 'purple',
    bgColor: 'bg-purple-50',
    iconColor: 'text-purple-600',
    borderColor: 'border-purple-200',
  },
  {
    key: 'conversionRate',
    label: 'Conversion Rate',
    icon: TrendingUp,
    color: 'teal',
    bgColor: 'bg-teal-50',
    iconColor: 'text-teal-600',
    borderColor: 'border-teal-200',
  },
];

export const SummaryCards: React.FC<SummaryCardsProps> = ({ stats }) => {
  const navigate = useNavigate();

  const handleCardClick = (key: string) => {
    if (key === 'lostCustomers') {
      navigate('/dms/lost-customers');
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {cardConfig.map((config) => {
        const Icon = config.icon;
        const value = stats[config.key as keyof DashboardStats];
        const displayValue = typeof value === 'number' && config.key === 'conversionRate'
          ? `${value}%`
          : value;
        const isClickable = config.key === 'lostCustomers';

        return (
          <div
            key={config.key}
            onClick={() => handleCardClick(config.key)}
            className={`card p-4 ${config.bgColor} border ${config.borderColor} ${
              isClickable ? 'cursor-pointer hover:shadow-md transition-shadow' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-secondary-600 font-medium mb-1">{config.label}</p>
                <p className="text-2xl font-bold text-secondary-900">{displayValue}</p>
              </div>
              <div className={`p-2 rounded-lg ${config.bgColor}`}>
                <Icon size={20} className={config.iconColor} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
