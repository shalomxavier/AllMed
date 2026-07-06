import { db } from '@/firebase/firebase';
import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import type { DashboardStats } from '@/pages/DMS/dashboard/types';

export type DashboardDateRange = 'today' | 'yesterday' | 'last7days' | 'last30days' | 'all';

/**
 * Compute the [start, end) bounds for a given date range preset.
 * Returns null bounds for 'all' (no filtering).
 */
const getDateRangeBounds = (range: DashboardDateRange): { start: Date | null; end: Date | null } => {
  const now = new Date();

  const startOfDay = (d: Date) => {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy;
  };
  const endOfDay = (d: Date) => {
    const copy = new Date(d);
    copy.setHours(23, 59, 59, 999);
    return copy;
  };

  switch (range) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) };
    case 'yesterday': {
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
    }
    case 'last7days': {
      const start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      return { start: startOfDay(start), end: endOfDay(now) };
    }
    case 'last30days': {
      const start = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
      return { start: startOfDay(start), end: endOfDay(now) };
    }
    case 'all':
    default:
      return { start: null, end: null };
  }
};

/**
 * Subscribe to dashboard statistics with real-time updates
 */
export const subscribeToDashboardStats = (
  callback: (stats: DashboardStats) => void,
  onError?: (error: Error) => void,
  dateRange: DashboardDateRange = 'all'
): Unsubscribe => {
  const conversationsRef = collection(db, 'whatsapp_conversations');
  const { start, end } = getDateRangeBounds(dateRange);

  // Query ALL conversations (active + archived) so "Total Conversations"
  // reflects every conversation ever created, not just currently active ones.
  // Date-range filtering is applied client-side below since createdAt bounds
  // combined with other filters would require composite indexes.
  return onSnapshot(
    conversationsRef,
    (snapshot) => {
      let conversations = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          deliveryStatus: data.contact?.deliveryStatus ?? data.deliveryStatus ?? null,
          isActive: data.isActive !== false,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
        };
      });

      if (start && end) {
        conversations = conversations.filter((c) => c.createdAt >= start && c.createdAt <= end);
      }

      // Calculate statistics
      const totalConversations = conversations.length;

      // "Active" = conversation has not been archived/closed (isActive flag).
      // Kept distinct from Pending/Delivered/Lost, which classify by outcome.
      const activeConversations = conversations.filter((c) => c.isActive).length;

      const deliveredCustomers = conversations.filter((c) => c.deliveryStatus === 'delivered').length;
      const lostCustomers = conversations.filter((c) => c.deliveryStatus === 'not_delivered').length;
      const pendingCustomers = conversations.filter(
        (c) => c.deliveryStatus === 'pending' || c.deliveryStatus === null
      ).length;

      // Calculate conversion rate
      const conversionRate = totalConversations > 0 
        ? Math.round((deliveredCustomers / totalConversations) * 100) 
        : 0;

      // Average response time (placeholder - would need message timestamps for accurate calculation)
      const averageResponseTime = '2 min 30 sec';

      const stats: DashboardStats = {
        totalConversations,
        activeConversations,
        deliveredCustomers,
        lostCustomers,
        pendingCustomers,
        averageResponseTime,
        conversionRate,
      };

      callback(stats);
    },
    (error) => {
      console.error('Error subscribing to dashboard stats:', error);
      onError?.(error);
    }
  );
};
