import { db } from '@/firebase/firebase';
import { collection, query, where, onSnapshot, orderBy, getDocs, type Unsubscribe } from 'firebase/firestore';
import type { LostCustomer } from '@/pages/DMS/lostCustomerTypes';
import type { LostReason } from '@/pages/DMS/types';
import type { DeliveryStatus } from '@/types/index';

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
    async (snapshot) => {
      const customers: LostCustomer[] = await Promise.all(
        snapshot.docs.map(async (doc) => {
          const data = doc.data();
          const contact = data.contact || {};

          // Fetch internal notes from enquiries collection
          let internalNotes: string | undefined = undefined;
          try {
            const enquiryQuery = query(
              collection(db, 'enquiries'),
              where('conversationId', '==', doc.id)
            );
            const enquirySnapshot = await getDocs(enquiryQuery);
            if (!enquirySnapshot.empty) {
              const enquiryDoc = enquirySnapshot.docs[0].data();
              internalNotes = enquiryDoc.notes || undefined;
            }
          } catch (err) {
            console.error('[LostCustomerService] Error fetching enquiry notes:', err);
          }

          return {
            id: doc.id,
            conversationId: doc.id,
            customerName: contact.name || 'Unknown',
            customerPhone: contact.phoneNumber || 'Unknown',
            businessPhoneNumber: data.businessPhoneNumber || data.businessPhoneNumberId || 'Unknown',
            storeWhatsAppNumber: data.businessPhoneNumberId || data.businessPhoneNumber || 'Unknown',
            storeName: data.storeName || 'Main Store',
            deliveryStatus: (contact.deliveryStatus ?? data.deliveryStatus ?? 'not_delivered') as DeliveryStatus,
            lostReason: (contact.deliveryReason || 'Other') as LostReason,
            customReason: contact.customReason || data.customReason || undefined,
            internalNotes,
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
            lostDate: data.updatedAt?.toDate() || new Date(),
            responseTime: contact.responseTime || data.responseTime || undefined,
            messages: [], // Messages are loaded via subscribeToMessages in the page
          };
        })
      );

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
