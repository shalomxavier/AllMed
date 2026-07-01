import { db } from '@/firebase/firebase';
import { collection, query, where, onSnapshot, orderBy, type Unsubscribe } from 'firebase/firestore';
import type { LostCustomer } from '@/pages/DMS/lostCustomerTypes';
import type { LostReason } from '@/pages/DMS/types';

/**
 * Subscribe to lost customers with real-time updates
 */
export const subscribeToLostCustomers = (
  callback: (customers: LostCustomer[]) => void,
  onError?: (error: Error) => void
): Unsubscribe => {
  const conversationsRef = collection(db, 'whatsapp_conversations');
  
  // Query only lost conversations (deliveryStatus == "not_delivered")
  const q = query(
    conversationsRef,
    where('contact.deliveryStatus', '==', 'not_delivered'),
    orderBy('updatedAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const customers: LostCustomer[] = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          conversationId: doc.id,
          customerName: data.contact?.name || 'Unknown',
          customerPhone: data.contact?.phoneNumber || 'Unknown',
          storeWhatsAppNumber: data.businessPhoneNumberId || 'Unknown',
          storeName: data.storeName || 'Main Store',
          lostReason: data.contact?.deliveryReason || 'Other',
          customReason: data.contact?.customReason || undefined,
          lostDate: data.updatedAt?.toDate() || new Date(),
          messages: [], // Messages will be loaded separately if needed
        };
      });

      callback(customers);
    },
    (error) => {
      console.error('Error subscribing to lost customers:', error);
      onError?.(error);
    }
  );
};

/**
 * Filter lost customers by search query
 */
export const filterLostCustomers = (
  customers: LostCustomer[],
  searchQuery: string
): LostCustomer[] => {
  if (!searchQuery.trim()) return customers;

  const queryLower = searchQuery.toLowerCase();
  return customers.filter(
    (customer) =>
      customer.customerName.toLowerCase().includes(queryLower) ||
      customer.customerPhone.includes(queryLower)
  );
};

/**
 * Filter lost customers by lost reason
 */
export const filterLostCustomersByReason = (
  customers: LostCustomer[],
  reason: LostReason | 'all'
): LostCustomer[] => {
  if (reason === 'all') return customers;
  return customers.filter((customer) => customer.lostReason === reason);
};

/**
 * Filter lost customers by date range
 */
export const filterLostCustomersByDateRange = (
  customers: LostCustomer[],
  startDate?: Date,
  endDate?: Date
): LostCustomer[] => {
  if (!startDate && !endDate) return customers;

  return customers.filter((customer) => {
    const lostDate = new Date(customer.lostDate);
    if (startDate && lostDate < startDate) return false;
    if (endDate && lostDate > endDate) return false;
    return true;
  });
};
