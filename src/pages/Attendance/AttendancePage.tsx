import { useNavigate } from 'react-router-dom';
import { Users, Calendar, Clock, Umbrella, Fingerprint } from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/common';

export const AttendancePage: React.FC = () => {
  const navigate = useNavigate();
  return (
    <PageContainer>
      <div className="mt-6">
        <PageHeader
          title="Attendance Management"
          description="Track and manage staff attendance records"
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mt-12">
        <div className="card p-5 flex flex-col items-center justify-center aspect-square cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/attendance/employees')}>
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mb-3">
            <Users className="w-9 h-9 text-blue-600" />
          </div>
          <p className="text-base font-semibold text-secondary-900 text-center">Employees</p>
        </div>
        <div className="card p-5 flex flex-col items-center justify-center aspect-square cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/attendance/records')}>
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-3">
            <Calendar className="w-9 h-9 text-green-600" />
          </div>
          <p className="text-base font-semibold text-secondary-900 text-center">Attendance</p>
        </div>
        <div className="card p-5 flex flex-col items-center justify-center aspect-square cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/attendance/shifts')}>
          <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mb-3">
            <Clock className="w-9 h-9 text-orange-600" />
          </div>
          <p className="text-base font-semibold text-secondary-900 text-center">Shifts</p>
        </div>
        <div className="card p-5 flex flex-col items-center justify-center aspect-square cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/attendance/leaves')}>
          <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mb-3">
            <Umbrella className="w-9 h-9 text-purple-600" />
          </div>
          <p className="text-base font-semibold text-secondary-900 text-center">Week Off / Leave</p>
        </div>
        <div className="card p-5 flex flex-col items-center justify-center aspect-square cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/attendance/devices')}>
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-3">
            <Fingerprint className="w-9 h-9 text-red-600" />
          </div>
          <p className="text-base font-semibold text-secondary-900 text-center">Devices</p>
        </div>
      </div>
    </PageContainer>
  );
};
