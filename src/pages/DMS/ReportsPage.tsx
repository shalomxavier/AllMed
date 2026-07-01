import { PageContainer, PageHeader } from '@/components/common';

export const ReportsPage: React.FC = () => {
  return (
    <PageContainer>
      <div className="mt-6">
        <PageHeader title="Reports" />
      </div>
      <div className="flex items-center justify-center mt-12">
        <div className="card p-8 max-w-md text-center">
          <p className="text-lg text-secondary-700">This page will contain enquiry Reports.</p>
        </div>
      </div>
    </PageContainer>
  );
};
