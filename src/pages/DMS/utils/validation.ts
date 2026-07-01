import type { EnquiryStatus, LostReason } from '../types';

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export const validateEnquiry = (
  status: EnquiryStatus,
  lostReason?: LostReason,
  otherReason?: string,
  followUpDate?: Date
): ValidationResult => {
  const errors: ValidationError[] = [];

  // Lost status validation
  if (status === 'Lost') {
    if (!lostReason) {
      errors.push({
        field: 'lostReason',
        message: 'Lost reason is required when status is Lost',
      });
    }

    if (lostReason === 'Other' && !otherReason?.trim()) {
      errors.push({
        field: 'otherReason',
        message: 'Please specify the reason when "Other" is selected',
      });
    }
  }

  // Follow-up validation
  if (status === 'Follow-up') {
    if (!followUpDate) {
      errors.push({
        field: 'followUpDate',
        message: 'Follow-up date is required when status is Follow-up',
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};
