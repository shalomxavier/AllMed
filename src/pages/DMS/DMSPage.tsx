import { useNavigate } from 'react-router-dom';
import { MessageSquare, LayoutDashboard, BarChart3, FileText, Building2, Settings } from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/common';

export const DMSPage: React.FC = () => {
  const navigate = useNavigate();
  return (
    <PageContainer>
      <div className="mt-6">
        <PageHeader
          title="DMS"
          description="Centralized customer communication and pharmacy CRM."
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-12">
        <div className="card p-5 flex flex-col items-center justify-center aspect-square cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/dms/workspace')}>
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-3">
            <MessageSquare className="w-9 h-9 text-green-600" />
          </div>
          <p className="text-base font-semibold text-secondary-900 text-center">Customer Workspace</p>
          <p className="text-sm text-secondary-600 text-center mt-1">Handle WhatsApp customer conversations.</p>
        </div>
        <div className="card p-5 flex flex-col items-center justify-center aspect-square cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/dms/dashboard')}>
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mb-3">
            <LayoutDashboard className="w-9 h-9 text-blue-600" />
          </div>
          <p className="text-base font-semibold text-secondary-900 text-center">Dashboard</p>
          <p className="text-sm text-secondary-600 text-center mt-1">Monitor enquiry performance.</p>
        </div>
        <div className="card p-5 flex flex-col items-center justify-center aspect-square cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/dms/analytics')}>
          <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mb-3">
            <BarChart3 className="w-9 h-9 text-purple-600" />
          </div>
          <p className="text-base font-semibold text-secondary-900 text-center">Analytics</p>
          <p className="text-sm text-secondary-600 text-center mt-1">View trends and conversion insights.</p>
        </div>
        <div className="card p-5 flex flex-col items-center justify-center aspect-square cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/dms/reports')}>
          <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mb-3">
            <FileText className="w-9 h-9 text-orange-600" />
          </div>
          <p className="text-base font-semibold text-secondary-900 text-center">Reports</p>
          <p className="text-sm text-secondary-600 text-center mt-1">Generate enquiry reports.</p>
        </div>
        <div className="card p-5 flex flex-col items-center justify-center aspect-square cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/dms/stores')}>
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-3">
            <Building2 className="w-9 h-9 text-red-600" />
          </div>
          <p className="text-base font-semibold text-secondary-900 text-center">Stores</p>
          <p className="text-sm text-secondary-600 text-center mt-1">View store level performance.</p>
        </div>
        <div className="card p-5 flex flex-col items-center justify-center aspect-square cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/dms/settings')}>
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-3">
            <Settings className="w-9 h-9 text-gray-600" />
          </div>
          <p className="text-base font-semibold text-secondary-900 text-center">Settings</p>
          <p className="text-sm text-secondary-600 text-center mt-1">Manage DMS configuration.</p>
        </div>
      </div>
    </PageContainer>
  );
};
