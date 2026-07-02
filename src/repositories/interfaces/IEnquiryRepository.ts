import type { Enquiry, EnquiryStatus, LostReason } from '@/pages/DMS/types';

export interface IEnquiryRepository {
  getEnquiry(enquiryId: string): Promise<Enquiry | null>;
  getEnquiryByConversationId(conversationId: string): Promise<Enquiry | null>;
  updateStatus(enquiryId: string, status: EnquiryStatus): Promise<void>;
  updateNotes(enquiryId: string, notes: string): Promise<void>;
  scheduleFollowUp(enquiryId: string, followUpDate: Date, followUpTime: string, reminderNote: string): Promise<void>;
  updateLostReason(enquiryId: string, lostReason: LostReason, otherReason?: string): Promise<void>;
  subscribeToEnquiry(enquiryId: string, callback: (enquiry: Enquiry | null) => void): () => void;
}
