export const LOST_REASONS = [
  'Out of Stock',
  'Price Too High',
  'No Reply From Customer',
  'Late Response',
  'Customer Purchased Elsewhere',
  'Prescription Issue',
  'Delivery Not Available',
  'Other',
] as const;

export type LostReason = typeof LOST_REASONS[number];
