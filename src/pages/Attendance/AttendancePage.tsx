import { useNavigate } from 'react-router-dom';
import { Users, ClipboardList, Clock, Umbrella, Fingerprint, Briefcase, Building2, FileText, Lightbulb, Building } from 'lucide-react';
import { PageContainer } from '@/components/common';

export const AttendancePage: React.FC = () => {
  const navigate = useNavigate();
  return (
    <PageContainer>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-4 mt-4">
        <div className="card p-5 flex flex-col items-center justify-center aspect-square cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/attendance/employees')}>
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mb-3">
            <Users className="w-9 h-9 text-blue-600" />
          </div>
          <p className="text-base font-semibold text-secondary-900 text-center">Employees</p>
        </div>
        <div className="card p-5 flex flex-col items-center justify-center aspect-square cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/attendance/records')}>
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-3">
            <ClipboardList className="w-9 h-9 text-green-600" />
          </div>
          <p className="text-base font-semibold text-secondary-900 text-center">Logs</p>
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
        <div className="card p-5 flex flex-col items-center justify-center aspect-square cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/attendance/reports')}>
          <div className="w-16 h-16 rounded-full bg-pink-100 flex items-center justify-center mb-3">
            <FileText className="w-9 h-9 text-pink-600" />
          </div>
          <p className="text-base font-semibold text-secondary-900 text-center">Reports</p>
        </div>
        <div className="card p-5 flex flex-col items-center justify-center aspect-square cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/attendance/devices')}>
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-3">
            <Fingerprint className="w-9 h-9 text-red-600" />
          </div>
          <p className="text-base font-semibold text-secondary-900 text-center">Devices</p>
        </div>
        <div className="card p-5 flex flex-col items-center justify-center aspect-square cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/attendance/branches')}>
          <div className="w-16 h-16 rounded-full bg-cyan-100 flex items-center justify-center mb-3">
            <Building className="w-9 h-9 text-cyan-600" />
          </div>
          <p className="text-base font-semibold text-secondary-900 text-center">Branches</p>
        </div>
        <div className="card p-5 flex flex-col items-center justify-center aspect-square cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/attendance/designations')}>
          <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center mb-3">
            <Briefcase className="w-9 h-9 text-teal-600" />
          </div>
          <p className="text-base font-semibold text-secondary-900 text-center">Designations</p>
        </div>
        <div className="card p-5 flex flex-col items-center justify-center aspect-square cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/attendance/departments')}>
          <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center mb-3">
            <Building2 className="w-9 h-9 text-indigo-600" />
          </div>
          <p className="text-base font-semibold text-secondary-900 text-center">Departments</p>
        </div>
        <div className="card p-5 flex flex-col items-center justify-center aspect-square cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/attendance/insights')}>
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-3">
            <Lightbulb className="w-9 h-9 text-amber-600" />
          </div>
          <p className="text-base font-semibold text-secondary-900 text-center">Insights</p>
        </div>
      </div>
    </PageContainer>
  );
};
