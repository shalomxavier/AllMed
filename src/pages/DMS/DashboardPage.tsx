import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PageContainer } from '@/components/common';
import { SummaryCards } from './dashboard/SummaryCards';
import { FilterBar } from './dashboard/FilterBar';
import { DashboardCharts } from './dashboard/DashboardCharts';
import { subscribeToDashboardStats } from '@/services/dashboardService';
import type { DashboardStats } from './dashboard/types';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedStore, setSelectedStore] = useState('all');
  const [selectedDateRange, setSelectedDateRange] = useState<'today' | 'yesterday' | 'last7days' | 'last30days'>('last7days');
  const [stats, setStats] = useState<DashboardStats>({
    totalConversations: 0,
    activeConversations: 0,
    deliveredCustomers: 0,
    lostCustomers: 0,
    averageResponseTime: '0 min 0 sec',
    conversionRate: 0,
    lostReasons: {},
  });
  const [loading, setLoading] = useState(true);

  // Subscribe to real-time dashboard statistics
  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToDashboardStats(
      (updatedStats) => {
        setStats(updatedStats);
        setLoading(false);
      },
      (error) => {
        console.error('Error loading dashboard stats:', error);
        setLoading(false);
      },
      selectedDateRange
    );

    return () => {
      unsubscribe();
    };
  }, [selectedDateRange]);

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
          <h1 className="text-xl font-semibold text-secondary-900">Conversion Insights</h1>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-4">
        <FilterBar
          selectedStore={selectedStore}
          onStoreChange={setSelectedStore}
          selectedDateRange={selectedDateRange}
          onDateRangeChange={setSelectedDateRange}
        />
      </div>

      {/* Summary Cards */}
      <div className="mt-6">
        {loading ? (
          <div className="text-center py-8 text-secondary-500">Loading dashboard statistics...</div>
        ) : (
          <SummaryCards stats={stats} />
        )}
      </div>

      {/* Charts */}
      <div className="mt-6">
        {loading ? (
          <div className="text-center py-8 text-secondary-500">Loading charts...</div>
        ) : (
          <DashboardCharts stats={stats} />
        )}
      </div>
    </PageContainer>
  );
};
