import { collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { db } from '@/firebase/firebase';
import type { EnquiryStatus, LostReason } from '@/pages/DMS/types';

export interface EnquiryDocument {
  enquiryId: string;
  conversationId: string;
  status: EnquiryStatus;
  lostReason?: LostReason;
  otherReason?: string;
  notes: string;
  followUpDate?: Date;
  followUpTime?: string;
  followUpReminderNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const enquiriesService = {
  async getEnquiry(enquiryId: string): Promise<EnquiryDocument | null> {
    const docRef = doc(db, 'enquiries', enquiryId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    const data = docSnap.data();
    return {
      enquiryId: docSnap.id,
      ...data,
      createdAt: data.createdAt?.toDate?.() || data.createdAt || new Date(),
      updatedAt: data.updatedAt?.toDate?.() || data.updatedAt || new Date(),
    } as EnquiryDocument;
  },

  async getEnquiryByConversationId(conversationId: string): Promise<EnquiryDocument | null> {
    const q = query(
      collection(db, 'enquiries'),
      where('conversationId', '==', conversationId)
    );

    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      return null;
    }

    const doc = querySnapshot.docs[0];
    const data = doc.data();
    return {
      enquiryId: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate?.() || data.createdAt || new Date(),
      updatedAt: data.updatedAt?.toDate?.() || data.updatedAt || new Date(),
    } as EnquiryDocument;
  },

  async createEnquiry(data: Omit<EnquiryDocument, 'enquiryId' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const docRef = doc(collection(db, 'enquiries'));
    const enquiryId = docRef.id;
    
    const now = new Date();
    await setDoc(docRef, {
      ...data,
      enquiryId,
      createdAt: now,
      updatedAt: now,
    });
    
    return enquiryId;
  },

  async updateStatus(enquiryId: string, status: EnquiryStatus): Promise<void> {
    const docRef = doc(db, 'enquiries', enquiryId);
    await updateDoc(docRef, {
      status,
      updatedAt: new Date(),
    });
  },

  async updateNotes(enquiryId: string, notes: string): Promise<void> {
    const docRef = doc(db, 'enquiries', enquiryId);
    await updateDoc(docRef, {
      notes,
      updatedAt: new Date(),
    });
  },

  async scheduleFollowUp(
    enquiryId: string,
    followUpDate: Date,
    followUpTime: string,
    reminderNote: string
  ): Promise<void> {
    const docRef = doc(db, 'enquiries', enquiryId);
    await updateDoc(docRef, {
      followUpDate,
      followUpTime,
      followUpReminderNote: reminderNote,
      status: 'Follow-up',
      updatedAt: new Date(),
    });
  },

  async updateLostReason(enquiryId: string, lostReason: LostReason, otherReason?: string): Promise<void> {
    const docRef = doc(db, 'enquiries', enquiryId);
    await updateDoc(docRef, {
      lostReason,
      otherReason: lostReason === 'Other' ? otherReason : null,
      status: 'Lost',
      updatedAt: new Date(),
    });
  },

  async updateEnquiry(enquiryId: string, data: Partial<EnquiryDocument>): Promise<void> {
    const docRef = doc(db, 'enquiries', enquiryId);
    await updateDoc(docRef, {
      ...data,
      updatedAt: new Date(),
    });
  },

  subscribeToEnquiry(
    enquiryId: string,
    callback: (enquiry: EnquiryDocument | null) => void
  ): Unsubscribe {
    const docRef = doc(db, 'enquiries', enquiryId);

    return onSnapshot(docRef, (doc) => {
      if (!doc.exists()) {
        callback(null);
        return;
      }

      const data = doc.data();
      callback({
        enquiryId: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || data.createdAt || new Date(),
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt || new Date(),
      } as EnquiryDocument);
    });
  },
};
