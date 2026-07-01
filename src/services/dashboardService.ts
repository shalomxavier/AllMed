import { db } from '@/firebase/firebase';
import { collection, query, where, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import type { DashboardStats } from '@/pages/DMS/dashboard/types';

/**
 * Subscribe to dashboard statistics with real-time updates
 */
export const subscribeToDashboardStats = (
  callback: (stats: DashboardStats) => void,
  onError?: (error: Error) => void
): Unsubscribe => {
  const conversationsRef = collection(db, 'whatsapp_conversations');
  
  // Query all active conversations
  const q = query(conversationsRef, where('isActive', '==', true));

  return onSnapshot(
    q,
    (snapshot) => {
      const conversations = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          deliveryStatus: data.contact?.deliveryStatus || null,
          isActive: data.isActive !== false,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
        };
      });

      // Calculate statistics
      const totalConversations = conversations.length;
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
