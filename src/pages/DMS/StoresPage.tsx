import { PageContainer, PageHeader } from '@/components/common';

export const StoresPage: React.FC = () => {
  return (
    <PageContainer>
      <div className="mt-6">
        <PageHeader title="Stores" />
      </div>
      <div className="flex items-center justify-center mt-12">
        <div className="card p-8 max-w-md text-center">
          <p className="text-lg text-secondary-700">This page will contain Store Management.</p>
        </div>
      </div>
    </PageContainer>
  );
};
