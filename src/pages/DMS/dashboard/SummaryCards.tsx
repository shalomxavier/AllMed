import { Users, UserCheck, UserX, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { DashboardStats } from './types';

interface SummaryCardsProps {
  stats: DashboardStats;
}

type NumericStatKey = 'totalConversations' | 'activeConversations' | 'deliveredCustomers' | 'lostCustomers' | 'conversionRate';

const cardConfig: { key: NumericStatKey; label: string; icon: typeof Users; color: string; bgColor: string; iconColor: string; borderColor: string }[] = [
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
    color: 'yellow',
    bgColor: 'bg-yellow-50',
    iconColor: 'text-yellow-600',
    borderColor: 'border-yellow-200',
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
    <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-4">
      {cardConfig.map((config) => {
        const Icon = config.icon;
        const value = stats[config.key];
        const displayValue = typeof value === 'number' && config.key === 'conversionRate'
          ? `${value}%`
          : value;
        const isClickable = config.key === 'lostCustomers';

        return (
          <div
            key={config.key}
            onClick={() => handleCardClick(config.key)}
            className={`card p-5 ${config.bgColor} border ${config.borderColor} ${
              isClickable ? 'cursor-pointer hover:shadow-md transition-shadow' : ''
            }`}
          >
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className={`p-3 rounded-full ${config.bgColor} mb-3`}>
                <Icon size={28} className={config.iconColor} />
              </div>
              <p className="text-3xl font-bold text-secondary-900 mb-1">{displayValue}</p>
              <p className="text-sm text-secondary-600 font-medium">{config.label}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
};
