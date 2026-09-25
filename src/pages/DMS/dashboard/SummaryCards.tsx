import { Users, UserCheck, UserX, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { DashboardStats } from './types';

interface SummaryCardsProps {
  stats: DashboardStats;
}

type NumericStatKey = 'totalConversations' | 'activeConversations' | 'deliveredCustomers' | 'lostCustomers' | 'conversionRate';

const cardConfig: { key: NumericStatKey; label: string; icon: typeof Users; iconColor: string }[] = [
  {
    key: 'totalConversations',
    label: 'Total Conversations',
    icon: Users,
    iconColor: 'text-secondary-500',
  },
  {
    key: 'activeConversations',
    label: 'Active Conversations',
    icon: Users,
    iconColor: 'text-amber-600',
  },
  {
    key: 'deliveredCustomers',
    label: 'Delivered Customers',
    icon: UserCheck,
    iconColor: 'text-green-600',
  },
  {
    key: 'lostCustomers',
    label: 'Lost Customers',
    icon: UserX,
    iconColor: 'text-red-600',
  },
  {
    key: 'conversionRate',
    label: 'Conversion Rate',
    icon: TrendingUp,
    iconColor: 'text-secondary-500',
  },
];

export const SummaryCards: React.FC<SummaryCardsProps> = ({ stats }) => {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-4">
      {cardConfig.map((config) => {
        const Icon = config.icon;
        const value = stats[config.key];
        const displayValue = typeof value === 'number' && config.key === 'conversionRate'
          ? `${value}%`
          : value;
        const isClickable = config.key === 'lostCustomers';

        const cardClass = `card p-5 ${
          isClickable ? 'cursor-pointer hover:shadow-md transition-shadow' : ''
        }`;

        const content = (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="p-2.5 rounded-full bg-secondary-50 mb-3">
              <Icon size={24} className={config.iconColor} />
            </div>
            <p className="text-3xl font-bold text-secondary-900 mb-1">{displayValue}</p>
            <p className="text-sm text-secondary-600 font-medium">{config.label}</p>
          </div>
        );

        return isClickable ? (
          <Link key={config.key} to="/dms/lost-customers" className={cardClass}>
            {content}
          </Link>
        ) : (
          <div key={config.key} className={cardClass}>
            {content}
          </div>
        );
      })}
    </div>
  );
};
