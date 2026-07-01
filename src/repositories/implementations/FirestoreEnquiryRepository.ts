import type { IEnquiryRepository } from '../interfaces/IEnquiryRepository';
import type { Enquiry, EnquiryStatus, LostReason } from '@/pages/DMS/types';
import { enquiriesService, type EnquiryDocument } from '@/services/firestore/enquiriesService';

export class FirestoreEnquiryRepository implements IEnquiryRepository {
  private documentToEnquiry(doc: EnquiryDocument): Enquiry {
    return {
      id: doc.enquiryId,
      conversationId: doc.conversationId,
      customerId: '', // Will be populated from conversation
      customerName: '', // Will be populated from conversation
      phoneNumber: '', // Will be populated from conversation
      store: '', // Will be populated from store data
      status: doc.status,
      lostReason: doc.lostReason,
      otherReason: doc.otherReason,
      followUpDate: doc.followUpDate,
      followUpTime: doc.followUpTime,
      followUpReminderNote: doc.followUpReminderNote,
      internalNotes: doc.notes,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async getEnquiry(enquiryId: string): Promise<Enquiry | null> {
    const doc = await enquiriesService.getEnquiry(enquiryId);
    if (!doc) return null;
    return this.documentToEnquiry(doc);
  }

  async getEnquiryByConversationId(conversationId: string): Promise<Enquiry | null> {
    const doc = await enquiriesService.getEnquiryByConversationId(conversationId);
    if (!doc) return null;
    return this.documentToEnquiry(doc);
  }

  async updateStatus(enquiryId: string, status: EnquiryStatus): Promise<void> {
    await enquiriesService.updateStatus(enquiryId, status);
  }

  async updateNotes(enquiryId: string, notes: string): Promise<void> {
    await enquiriesService.updateNotes(enquiryId, notes);
  }

  async scheduleFollowUp(enquiryId: string, followUpDate: Date, followUpTime: string, reminderNote: string): Promise<void> {
    await enquiriesService.scheduleFollowUp(enquiryId, followUpDate, followUpTime, reminderNote);
  }

  async updateLostReason(enquiryId: string, lostReason: LostReason, otherReason?: string): Promise<void> {
    await enquiriesService.updateLostReason(enquiryId, lostReason, otherReason);
  }

  subscribeToEnquiry(enquiryId: string, callback: (enquiry: Enquiry | null) => void): () => void {
    return enquiriesService.subscribeToEnquiry(enquiryId, (doc) => {
      if (!doc) {
        callback(null);
        return;
      }
      callback(this.documentToEnquiry(doc));
    });
  }
}
