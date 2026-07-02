import { db } from '@/firebase/firebase';
import { collection, query, where, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import type { LostReason } from '@/pages/DMS/types';

export interface LostReasonCount {
  reason: LostReason;
  count: number;
  percentage: number;
}

export interface DailyEnquiryData {
  date: string;
  count: number;
}

/**
 * Subscribe to lost reason distribution with real-time updates
 */
export const subscribeToLostReasonDistribution = (
  callback: (distribution: LostReasonCount[]) => void,
  onError?: (error: Error) => void
): Unsubscribe => {
  const conversationsRef = collection(db, 'whatsapp_conversations');
  
  // Query only lost conversations
  const q = query(conversationsRef, where('contact.deliveryStatus', '==', 'not_delivered'));

  return onSnapshot(
    q,
    (snapshot) => {
      const conversations = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          deliveryReason: data.contact?.deliveryReason || null,
          customReason: data.contact?.customReason || null,
        };
      });

      // Count by lost reason
      const reasonCounts: Record<string, number> = {};
      conversations.forEach((conv) => {
        const reason = conv.deliveryReason || 'Other';
        reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
      });

      const total = conversations.length;
      const reasons: LostReason[] = [
        'Out of Stock',
        'Price Too High',
        'No Reply From Customer',
        'Late Response',
        'Customer Purchased Elsewhere',
        'Prescription Issue',
        'Delivery Not Available',
        'Other',
      ];

      const distribution: LostReasonCount[] = reasons.map((reason) => ({
        reason,
        count: reasonCounts[reason] || 0,
        percentage: total > 0 ? Math.round(((reasonCounts[reason] || 0) / total) * 100) : 0,
      })).filter((r) => r.count > 0);

      callback(distribution);
    },
    (error) => {
      console.error('Error subscribing to lost reason distribution:', error);
      onError?.(error);
    }
  );
};

/**
 * Subscribe to daily enquiry trends with real-time updates
 */
export const subscribeToDailyEnquiryTrends = (
  days: number = 7,
  callback: (data: DailyEnquiryData[]) => void,
  onError?: (error: Error) => void
): Unsubscribe => {
  const conversationsRef = collection(db, 'whatsapp_conversations');
  
  // Query all conversations
  const q = query(conversationsRef, where('isActive', '==', true));

  return onSnapshot(
    q,
    (snapshot) => {
      const conversations = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          createdAt: data.createdAt?.toDate() || new Date(),
        };
      });

      // Group by date
      const dateCounts: Record<string, number> = {};
      const now = new Date();

      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        dateCounts[dateStr] = 0;
      }

      conversations.forEach((conv) => {
        const dateStr = conv.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (dateCounts.hasOwnProperty(dateStr)) {
          dateCounts[dateStr]++;
        }
      });

      const data: DailyEnquiryData[] = Object.entries(dateCounts).map(([date, count]) => ({
        date,
        count,
      }));

      callback(data);
    },
    (error) => {
      console.error('Error subscribing to daily enquiry trends:', error);
      onError?.(error);
    }
  );
};

/**
 * Calculate delivery percentage from conversations
 */
export const calculateDeliveryPercentage = (conversations: any[]): number => {
  if (conversations.length === 0) return 0;
  const delivered = conversations.filter((c) => c.deliveryStatus === 'delivered').length;
  return Math.round((delivered / conversations.length) * 100);
};

/**
 * Calculate conversion percentage from conversations
 */
export const calculateConversionPercentage = (conversations: any[]): number => {
  if (conversations.length === 0) return 0;
  const delivered = conversations.filter((c) => c.deliveryStatus === 'delivered').length;
  return Math.round((delivered / conversations.length) * 100);
};
