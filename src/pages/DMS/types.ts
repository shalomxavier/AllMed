export type EnquiryStatus = 'New' | 'In Progress' | 'Converted' | 'Lost' | 'Follow-up';

export type LostReason = 
  | 'Out of Stock'
  | 'Price Too High'
  | 'No Reply From Customer'
  | 'Late Response'
  | 'Customer Purchased Elsewhere'
  | 'Prescription Issue'
  | 'Delivery Not Available'
  | 'Other';

export interface Enquiry {
  id: string;
  conversationId: string;
  customerId: string;
  customerName: string;
  phoneNumber: string;
  store: string;
  status: EnquiryStatus;
  lostReason?: LostReason;
  otherReason?: string;
  followUpDate?: Date;
  followUpTime?: string;
  followUpReminderNote?: string;
  internalNotes: string;
  createdAt: Date;
  updatedAt: Date;
}
