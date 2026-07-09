import { PieChart } from './PieChart';
import type { DashboardStats } from './types';

interface DashboardChartsProps {
  stats: DashboardStats;
}

const CONVERSION_COLORS = {
  delivered: '#22c55e',
  lost: '#ef4444',
  active: '#eab308',
};

const LOST_REASON_COLORS: Record<string, string> = {
  'Out of Stock': '#f87171',
  'Price Too High': '#fb923c',
  'No Reply From Customer': '#9ca3af',
  'Late Response': '#facc15',
  'Customer Purchased Elsewhere': '#60a5fa',
  'Prescription Issue': '#a78bfa',
  'Delivery Not Available': '#f472b6',
  'Other': '#d1d5db',
};

export const DashboardCharts: React.FC<DashboardChartsProps> = ({ stats }) => {
  const conversionData = [
    { label: 'Delivered', value: stats.deliveredCustomers, color: CONVERSION_COLORS.delivered },
    { label: 'Lost', value: stats.lostCustomers, color: CONVERSION_COLORS.lost },
    { label: 'Active', value: stats.activeConversations, color: CONVERSION_COLORS.active },
  ].filter((item) => item.value > 0);

  const lostReasonData = Object.entries(stats.lostReasons)
    .map(([reason, value]) => ({
      label: reason,
      value,
      color: LOST_REASON_COLORS[reason] || '#9ca3af',
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <PieChart title="Conversion Overview" data={conversionData} emptyText="No conversation data" />
      <PieChart
        title="Reasons for Not Delivered"
        data={lostReasonData}
        emptyText="No lost customer data"
      />
    </div>
  );
};
