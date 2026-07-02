import { PageContainer, PageHeader } from '@/components/common';

export const AnalyticsPage: React.FC = () => {
  return (
    <PageContainer>
      <div className="mt-6">
        <PageHeader title="Analytics" />
      </div>
      <div className="flex items-center justify-center mt-12">
        <div className="card p-8 max-w-md text-center">
          <p className="text-lg text-secondary-700">This page will contain Analytics and trends.</p>
        </div>
      </div>
    </PageContainer>
  );
};
