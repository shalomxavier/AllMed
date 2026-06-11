import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/common';

export const WhatsAppEnquiryPage: React.FC = () => {
  const navigate = useNavigate();
  return (
    <PageContainer>
      <div className="mt-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg text-secondary-500 hover:text-secondary-900 hover:bg-secondary-100 transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft size={22} />
          </button>
          <PageHeader title="WhatsApp Enquiry Tracker" />
        </div>
      </div>
    </PageContainer>
  );
};
