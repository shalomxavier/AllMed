import { Link } from 'react-router-dom';
import { MessageSquare, LayoutDashboard } from 'lucide-react';
import { PageContainer } from '@/components/common';

const tileClass = 'card p-5 flex flex-col items-center justify-center aspect-square cursor-pointer hover:shadow-md transition-shadow';
const iconWrap = 'w-12 h-12 rounded-full bg-primary-50 flex items-center justify-center mb-3';
const iconClass = 'w-6 h-6 text-primary-600';

export const DMSPage: React.FC = () => {
  return (
    <PageContainer>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-4 mt-4">
        <Link to="/dms/workspace" className={tileClass}>
          <div className={iconWrap}>
            <MessageSquare className={iconClass} />
          </div>
          <p className="text-base font-semibold text-secondary-900 text-center">WhatsApp Messenger</p>
        </Link>
        <Link to="/dms/dashboard" className={tileClass}>
          <div className={iconWrap}>
            <LayoutDashboard className={iconClass} />
          </div>
          <p className="text-base font-semibold text-secondary-900 text-center">Conversion Insights</p>
        </Link>
      </div>
    </PageContainer>
  );
};
