import { Link } from 'react-router-dom';
import { Users, ClipboardList, Clock, Umbrella, Fingerprint, FileText, Lightbulb } from 'lucide-react';
import { PageContainer } from '@/components/common';
import { useAuthContext } from '@/contexts/AuthContext';

const tileClass = 'card p-5 flex flex-col items-center justify-center aspect-square cursor-pointer hover:shadow-md transition-shadow';
const iconWrap = 'w-12 h-12 rounded-full bg-primary-50 flex items-center justify-center mb-3';
const iconClass = 'w-6 h-6 text-primary-600';

export const AttendancePage: React.FC = () => {
  const { userData } = useAuthContext();
  const isBranchManager = userData?.designation === 'Branch Manager';

  return (
    <PageContainer>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-4 mt-4">
        <Link to="/attendance/employees" className={tileClass}>
          <div className={iconWrap}>
            <Users className={iconClass} />
          </div>
          <p className="text-base font-semibold text-secondary-900 text-center">Employees</p>
        </Link>
        <Link to="/attendance/records" className={tileClass}>
          <div className={iconWrap}>
            <ClipboardList className={iconClass} />
          </div>
          <p className="text-base font-semibold text-secondary-900 text-center">Logs</p>
        </Link>
        <Link to="/attendance/shifts" className={tileClass}>
          <div className={iconWrap}>
            <Clock className={iconClass} />
          </div>
          <p className="text-base font-semibold text-secondary-900 text-center">Shifts</p>
        </Link>
        <Link to="/attendance/leaves" className={tileClass}>
          <div className={iconWrap}>
            <Umbrella className={iconClass} />
          </div>
          <p className="text-base font-semibold text-secondary-900 text-center">Week Off / Leave</p>
        </Link>
        <Link to="/attendance/reports" className={tileClass}>
          <div className={iconWrap}>
            <FileText className={iconClass} />
          </div>
          <p className="text-base font-semibold text-secondary-900 text-center">Reports</p>
        </Link>
        {!isBranchManager && (
          <Link to="/attendance/devices" className={tileClass}>
            <div className={iconWrap}>
              <Fingerprint className={iconClass} />
            </div>
            <p className="text-base font-semibold text-secondary-900 text-center">Devices</p>
          </Link>
        )}
        <Link to="/attendance/insights" className={tileClass}>
          <div className={iconWrap}>
            <Lightbulb className={iconClass} />
          </div>
          <p className="text-base font-semibold text-secondary-900 text-center">Insights</p>
        </Link>

      </div>
    </PageContainer>
  );
};
