import { PageContainer, PageHeader, EmptyState } from '@/components/common';
import { CalendarDays } from 'lucide-react';

export const AttendancePage: React.FC = () => {
  return (
    <PageContainer>
      <PageHeader
        title="Attendance Management"
        description="Track and manage staff attendance records"
      />

      {/* Empty Content Container */}
      <div className="card min-h-[400px]">
        <EmptyState
          title="Attendance Records"
          description="Attendance tracking functionality will be implemented here."
          icon={<CalendarDays className="w-8 h-8 text-secondary-400" />}
        />
      </div>
    </PageContainer>
  );
};
