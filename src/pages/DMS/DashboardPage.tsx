import { useState, useEffect } from 'react';
import { PageContainer } from '@/components/common';
import { SummaryCards } from './dashboard/SummaryCards';
import { FilterBar } from './dashboard/FilterBar';
import { subscribeToDashboardStats } from '@/services/dashboardService';
import type { DashboardStats } from './dashboard/types';

export const DashboardPage: React.FC = () => {
  const [selectedStore, setSelectedStore] = useState('all');
  const [selectedDateRange, setSelectedDateRange] = useState<'today' | 'yesterday' | 'last7days' | 'last30days'>('last7days');
  const [stats, setStats] = useState<DashboardStats>({
    totalConversations: 0,
    activeConversations: 0,
    deliveredCustomers: 0,
    lostCustomers: 0,
    pendingCustomers: 0,
    averageResponseTime: '0 min 0 sec',
    conversionRate: 0,
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
    </PageContainer>
  );
};
