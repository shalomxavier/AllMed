import { useNavigate } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/common';

export const DMSPage: React.FC = () => {
  const navigate = useNavigate();
  return (
    <PageContainer>
      <div className="mt-6">
        <PageHeader
          title="Delivery Management System"
          description="Delivery Management System"
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mt-2">
        <div className="card p-3 flex flex-col items-center justify-center aspect-square cursor-pointer hover:shadow-md transition-shadow max-w-[140px]" onClick={() => navigate('/dms/whatsapp-enquiry')}>
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mb-2">
            <MessageCircle className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-xs font-semibold text-secondary-900 text-center">WhatsApp Enquiry Tracker</p>
        </div>
      </div>
    </PageContainer>
  );
};
