export interface DashboardStats {
  totalConversations: number;
  activeConversations: number;
  deliveredCustomers: number;
  lostCustomers: number;
  averageResponseTime: string;
  conversionRate: number;
  lostReasons: Record<string, number>;
}
