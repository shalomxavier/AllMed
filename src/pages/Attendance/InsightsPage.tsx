import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lightbulb, X, ArrowLeft } from 'lucide-react';
import { Timestamp, collection, getDocs, getFirestore, orderBy, query, where } from 'firebase/firestore';
import { PageContainer, RedSpinner } from '@/components/common';
import { PieChart } from '@/pages/DMS/dashboard/PieChart';
import { useAuthContext } from '@/contexts/AuthContext';

interface Employee {
  employeeCode?: string;
  employeeCodeInDevice?: string;
  employeeName?: string;
  designation?: string;
  subDesignation?: string;
  workLocation?: string;
}

interface RawPunch {
  userId?: string;
}

interface ShiftEmployee {
  employeeCode?: string;
  fromDate?: string;
  toDate?: string;
}

interface Shift {
  employees?: ShiftEmployee[];
  startTime?: string;
  endTime?: string;
}

interface ChartEmployee {
  name: string;
  employeeCode: string;
  subDesignation: string;
  shiftTime: string;
}

interface ManagerChart {
  key: string;
  title: string;
  data: Array<{ label: string; value: number; color: string }>;
  employeesByDesignation: Record<string, ChartEmployee[]>;
  emptyText: string;
}

const CHART_COLORS = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#db2777', '#0891b2', '#ca8a04', '#4f46e5'];

const getToday = (): string => {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
};

const ALL_EMPLOYEES_KEY = 'all';

export const InsightsPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, userData } = useAuthContext();
  const [selectedDate, setSelectedDate] = useState(getToday);
  const [managerCharts, setManagerCharts] = useState<ManagerChart[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [selectedDesignation, setSelectedDesignation] = useState<{ chartTitle: string; designation: string; employees: ChartEmployee[] } | null>(null);
  const [branchOptions, setBranchOptions] = useState<string[]>([]);
  const [branchFilter, setBranchFilter] = useState('');
  const [managerBranchName, setManagerBranchName] = useState<string | null>(null);

  useEffect(() => {
    const resolveBranches = async () => {
      const firestore = getFirestore();
      if (userData?.designation === 'Branch Manager' && currentUser) {
        try {
          const branchQuery = query(collection(firestore, 'branches'), where('managerId', '==', currentUser.uid));
          const branchSnapshot = await getDocs(branchQuery);
          const branchName = branchSnapshot.empty ? '' : (branchSnapshot.docs[0].data().name || '');
          setManagerBranchName(branchName);
          setBranchFilter(branchName);
        } catch (err) {
          console.error('Error resolving manager branch:', err);
          setManagerBranchName('');
        }
      } else {
        try {
          const branchesSnapshot = await getDocs(collection(firestore, 'branches'));
          setBranchOptions(branchesSnapshot.docs.map((b) => b.data().name).filter(Boolean).sort());
        } catch (err) {
          console.error('Error fetching branches list:', err);
        }
      }
    };
    resolveBranches();
  }, [currentUser, userData]);

  useEffect(() => {
    const fetchAttendanceInsights = async () => {
      if (!selectedDate) return;

      setAttendanceLoading(true);
      try {
        const firestore = getFirestore();
        const startOfDay = Timestamp.fromDate(new Date(`${selectedDate}T00:00:00Z`));
        const endOfDay = Timestamp.fromDate(new Date(`${selectedDate}T23:59:59.999Z`));
        const [employeesSnapshot, punchesSnapshot, shiftsSnapshot] = await Promise.all([
          getDocs(collection(firestore, 'employees')),
          getDocs(query(collection(firestore, 'rawPunches'), where('logDate', '>=', startOfDay), where('logDate', '<=', endOfDay), orderBy('logDate'))),
          getDocs(collection(firestore, 'shifts')),
        ]);

        const employees = employeesSnapshot.docs
          .map((employee) => employee.data() as Employee)
          .filter((employee) => !branchFilter || employee.workLocation === branchFilter);
        const employeeByCode = new Map<string, Employee>();
        employees.forEach((employee) => {
          [employee.employeeCodeInDevice, employee.employeeCode].forEach((code) => {
            if (code) employeeByCode.set(code.trim().toLowerCase(), employee);
          });
        });

        const shiftTimesByEmployee = new Map<string, string>();
        shiftsSnapshot.docs.forEach((shiftDocument) => {
          const shift = shiftDocument.data() as Shift;
          shift.employees?.forEach((shiftEmployee) => {
            const employeeCode = shiftEmployee.employeeCode?.trim().toLowerCase();
            const isAssignedForDate = employeeCode
              && (!shiftEmployee.fromDate || selectedDate >= shiftEmployee.fromDate)
              && (!shiftEmployee.toDate || selectedDate <= shiftEmployee.toDate);
            if (isAssignedForDate && !shiftTimesByEmployee.has(employeeCode)) {
              shiftTimesByEmployee.set(employeeCode, `${shift.startTime || '—'} - ${shift.endTime || '—'}`);
            }
          });
        });

        const attendanceByDesignation = new Map<string, Set<string>>();
        const addEmployeeToAttendance = (employee: Employee, employeeCode: string) => {
          const designation = employee.designation?.trim() || 'Unassigned Designation';
          if (!attendanceByDesignation.has(designation)) attendanceByDesignation.set(designation, new Set());
          attendanceByDesignation.get(designation)!.add(employeeCode);
        };

        if (selectedDate > getToday()) {
          shiftsSnapshot.docs.forEach((shiftDocument) => {
            const shift = shiftDocument.data() as Shift;
            shift.employees?.forEach((shiftEmployee) => {
              const employeeCode = shiftEmployee.employeeCode?.trim().toLowerCase();
              const isAssignedForDate = employeeCode
                && (!shiftEmployee.fromDate || selectedDate >= shiftEmployee.fromDate)
                && (!shiftEmployee.toDate || selectedDate <= shiftEmployee.toDate);
              if (!isAssignedForDate) return;

              const employee = employeeByCode.get(employeeCode);
              if (employee) addEmployeeToAttendance(employee, employeeCode);
            });
          });
        } else {
          punchesSnapshot.docs.forEach((punchDocument) => {
            const employeeCode = (punchDocument.data() as RawPunch).userId?.trim().toLowerCase();
            if (!employeeCode) return;

            const employee = employeeByCode.get(employeeCode);
            if (employee) addEmployeeToAttendance(employee, employeeCode);
          });
        }

        const designationColors = new Map(
          Array.from(attendanceByDesignation.keys())
            .sort()
            .map((designation, index) => [designation, CHART_COLORS[index % CHART_COLORS.length]]),
        );
        const data = Array.from(attendanceByDesignation.entries())
          .map(([label, employeesPresent]) => ({
            label,
            value: employeesPresent.size,
            color: designationColors.get(label) || CHART_COLORS[0],
          }))
          .sort((first, second) => second.value - first.value);
        const employeesByDesignation = Object.fromEntries(
          Array.from(attendanceByDesignation.entries()).map(([designation, employeeCodes]) => [
            designation,
            Array.from(employeeCodes).map((employeeCode) => {
              const employee = employeeByCode.get(employeeCode);
              return {
                name: employee?.employeeName || employeeCode,
                employeeCode: employee?.employeeCode || employeeCode,
                subDesignation: employee?.subDesignation || '—',
                shiftTime: shiftTimesByEmployee.get(employeeCode) || 'No shift assigned',
              };
            }).sort((first, second) => first.name.localeCompare(second.name)),
          ]),
        );
        const emptyText = selectedDate > getToday()
          ? 'No data. Please assign shifts to the employees.'
          : 'No data. No punches yet for this date.';
        setManagerCharts([{
          key: ALL_EMPLOYEES_KEY,
          title: 'All Employees',
          data,
          employeesByDesignation,
          emptyText,
        }]);
      } catch (error) {
        console.error('Error fetching attendance insights:', error);
        setManagerCharts([]);
      } finally {
        setAttendanceLoading(false);
      }
    };

    fetchAttendanceInsights();
  }, [selectedDate, branchFilter]);

  const handleDesignationClick = (chart: ManagerChart, designation: string) => {
    const employees = chart.employeesByDesignation[designation] ?? [];
    if (employees.length > 0) setSelectedDesignation({ chartTitle: chart.title, designation, employees });
  };

  return (
    <PageContainer>
      <div className="mt-4 flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => navigate('/attendance')}
          className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft size={20} className="text-secondary-600" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-secondary-900">Attendance Insights</h1>
        </div>
      </div>

      <div className="mt-4">
        <div className="card p-6 max-w-xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
              <Lightbulb className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-secondary-900">Attendance Insights</h2>
              <p className="text-sm text-secondary-500">View attendance breakdown for all employees.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="insights-date" className="block mb-2 text-sm font-medium text-secondary-700">
                Date
              </label>
              <input
                id="insights-date"
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="w-full px-3 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor="insights-branch" className="block mb-2 text-sm font-medium text-secondary-700">
                Branch
              </label>
              <select
                id="insights-branch"
                value={branchFilter}
                onChange={(event) => setBranchFilter(event.target.value)}
                disabled={userData?.designation === 'Branch Manager'}
                className="w-full px-3 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-secondary-100 disabled:cursor-not-allowed"
              >
                {userData?.designation === 'Branch Manager' ? (
                  <option value={managerBranchName ?? ''}>{managerBranchName || 'No branch assigned'}</option>
                ) : (
                  <>
                    <option value="">All Branches</option>
                    {branchOptions.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </>
                )}
              </select>
            </div>
          </div>
        </div>

        <div className="mt-6">
          {attendanceLoading ? (
            <div className="text-center py-8 text-secondary-500 flex flex-col items-center gap-2">
              <RedSpinner />
              <span>Loading attendance insights...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {managerCharts.map((chart) => (
                <PieChart
                  key={chart.key}
                  title={chart.title}
                  data={chart.data}
                  emptyText={chart.emptyText}
                  onLabelClick={(designation) => handleDesignationClick(chart, designation)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedDesignation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-secondary-200 p-5">
              <div>
                <h2 className="text-lg font-semibold text-secondary-900">{selectedDesignation.designation}</h2>
                <p className="text-sm text-secondary-500">{selectedDesignation.chartTitle}</p>
              </div>
              <button
                onClick={() => setSelectedDesignation(null)}
                className="rounded-lg p-1.5 text-secondary-500 hover:bg-secondary-100 hover:text-secondary-900"
                aria-label="Close employee list"
              >
                <X size={20} />
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto p-5">
              <div className="space-y-3">
                {selectedDesignation.employees.map((employee) => (
                  <div key={employee.employeeCode} className="rounded-lg border border-secondary-200 p-3">
                    <p className="font-medium text-black">{employee.name}</p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-secondary-500">
                      <span className="text-indigo-700">{employee.employeeCode}</span>
                      <span className="text-indigo-700">{selectedDesignation.designation} ({employee.subDesignation})</span>
                      <span className="text-green-700">Shift: {employee.shiftTime}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
};
