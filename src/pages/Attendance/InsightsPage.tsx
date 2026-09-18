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
  department?: string;
  dateOfJoining?: string;
  resignDate?: string;
  employmentStatus?: string;
}

interface RawPunch {
  userId?: string;
  logDate?: any;
  direction?: string;
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

interface LeaveRecord {
  type?: 'leave' | 'weekoff';
  employeeCode?: string;
  dates?: string[];
  fromDate?: string;
  toDate?: string;
  duration?: 'full_day' | 'half_day';
  days?: string[];
  status?: string;
}

interface ChartEmployee {
  name: string;
  employeeCode: string;
  subDesignation: string;
  shiftTime: string;
}

interface AttendanceChart {
  key: string;
  title: string;
  data: Array<{ label: string; value: number; color: string; total?: number }>;
  employeesByDesignation: Record<string, ChartEmployee[]>;
  employeesByDepartment?: Record<string, ChartEmployee[]>;
  departmentData?: Array<{ label: string; value: number; color: string; total?: number }>;
  emptyText: string;
}

const CHART_COLORS = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#db2777', '#0891b2', '#ca8a04', '#4f46e5'];

const toDate = (logDate: any): Date | null => {
  if (!logDate) return null;
  if (logDate?.toDate) return logDate.toDate();
  if (logDate instanceof Date) return logDate;
  return null;
};

const formatLocalDate = (date: Date | null): string => {
  if (!date) return '';
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const shiftDate = (dateStr: string, days: number): string => {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return formatLocalDate(d);
};

const isFutureDate = (dateStr: string): boolean => dateStr > formatLocalDate(new Date());

const isNightShift = (shift: Shift): boolean => {
  if (!shift?.startTime || !shift?.endTime) return false;
  const [sh, sm] = shift.startTime.split(':').map(Number);
  const [eh, em] = shift.endTime.split(':').map(Number);
  return (eh * 60 + em) <= (sh * 60 + sm);
};

const getShiftForEmployee = (employeeCode: string, dateStr: string, shifts: Shift[]): Shift | null => {
  const key = employeeCode.trim().toLowerCase();
  for (const shift of shifts) {
    const assignment = shift.employees?.find((emp) => {
      const code = emp.employeeCode?.trim().toLowerCase();
      return code === key
        && (!emp.fromDate || dateStr >= emp.fromDate)
        && (!emp.toDate || dateStr <= emp.toDate);
    });
    if (assignment) return shift;
  }
  return null;
};

const getAttendanceDate = (punch: RawPunch, shifts: Shift[]): string | null => {
  const d = toDate(punch.logDate);
  if (!d || !punch.userId) return null;
  const dateStr = formatLocalDate(d);
  const userId = punch.userId.trim().toLowerCase();
  if (punch.direction !== 'out') return dateStr;

  const timeMin = d.getUTCHours() * 60 + d.getUTCMinutes();
  const shiftToday = getShiftForEmployee(userId, dateStr, shifts);
  if (!shiftToday || !isNightShift(shiftToday)) return dateStr;

  const [sh, sm] = shiftToday.startTime!.split(':').map(Number);
  const shiftStartMin = sh * 60 + sm;
  if (timeMin >= shiftStartMin) return dateStr;

  const prevDay = new Date(dateStr + 'T00:00:00Z');
  prevDay.setUTCDate(prevDay.getUTCDate() - 1);
  return formatLocalDate(prevDay);
};

const ALL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const getStableEmployeeCode = (employee: Employee): string | null =>
  employee.employeeCode?.trim().toLowerCase()
  || employee.employeeCodeInDevice?.trim().toLowerCase()
  || null;

const isEmployeeActiveOnDate = (employee: Employee, dateStr: string): boolean => {
  if (employee.dateOfJoining && employee.dateOfJoining > dateStr) return false;
  if (employee.resignDate && employee.resignDate < dateStr) return false;
  // Also exclude stale records marked inactive without a resign date.
  if (!employee.resignDate && employee.employmentStatus?.trim().toLowerCase() === 'inactive') return false;
  return true;
};

const isOnLeaveOrWeekOff = (employeeCode: string, dateStr: string, leaves: LeaveRecord[]): boolean => {
  const key = employeeCode.trim().toLowerCase();
  const dayName = ALL_DAYS[new Date(dateStr + 'T00:00:00Z').getUTCDay()];
  return leaves.some((leave) => {
    const code = (leave.employeeCode ?? '').toString().trim().toLowerCase();
    if (code !== key) return false;

    if (leave.type === 'weekoff') {
      return leave.days?.map((d) => d.toLowerCase()).includes(dayName.toLowerCase()) ?? false;
    }

    if (leave.status && leave.status !== 'approved') return false;

    // Half-day leaves are still expected to be present; only full-day leaves count as absent.
    if (leave.duration === 'half_day') return false;

    if (leave.dates && leave.dates.includes(dateStr)) return true;
    if (leave.fromDate && leave.toDate && dateStr >= leave.fromDate && dateStr <= leave.toDate) return true;
    return false;
  });
};

const getToday = (): string => formatLocalDate(new Date());

const ALL_EMPLOYEES_KEY = 'all';

export const InsightsPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, userData } = useAuthContext();
  const [selectedDate, setSelectedDate] = useState(getToday);
  const [charts, setCharts] = useState<AttendanceChart[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<{ chartTitle: string; groupLabel: string; employees: ChartEmployee[] } | null>(null);
  const [branchOptions, setBranchOptions] = useState<string[]>([]);
  const [branchFilter, setBranchFilter] = useState('');
  const [managerBranchName, setManagerBranchName] = useState<string | null>(null);

  useEffect(() => {
    const resolveBranches = async () => {
      setBranchesLoading(true);
      setError(null);
      try {
        const firestore = getFirestore();
        if (userData?.designation === 'Branch Manager' && currentUser) {
          const branchQuery = query(collection(firestore, 'branches'), where('managerId', '==', currentUser.uid));
          const branchSnapshot = await getDocs(branchQuery);
          const branchName = branchSnapshot.empty ? '' : (branchSnapshot.docs[0].data().name || '');
          setManagerBranchName(branchName);
          setBranchFilter(branchName);
        } else {
          const branchesSnapshot = await getDocs(collection(firestore, 'branches'));
          setBranchOptions(branchesSnapshot.docs.map((b) => b.data().name).filter(Boolean).sort());
        }
      } catch (err) {
        console.error('Error resolving branches:', err);
        setError('Failed to load branches. Please try again.');
      } finally {
        setBranchesLoading(false);
      }
    };
    resolveBranches();
  }, [currentUser, userData]);

  useEffect(() => {
    const fetchAttendanceInsights = async () => {
      if (!selectedDate || branchesLoading) return;

      setAttendanceLoading(true);
      setError(null);
      try {
        const firestore = getFirestore();
        // Expand the query by one day on each side so night-shift out-punches that
        // belong to the previous attendance day are included, matching the logic in
        // /attendance/records (RawPunchesPage).
        const queryFrom = shiftDate(selectedDate, -1);
        const queryTo = shiftDate(selectedDate, 1);
        const startOfDay = Timestamp.fromDate(new Date(`${queryFrom}T00:00:00Z`));
        const endOfDay = Timestamp.fromDate(new Date(`${queryTo}T23:59:59.999Z`));
        const [employeesSnapshot, punchesSnapshot, shiftsSnapshot, leavesSnapshot] = await Promise.all([
          getDocs(collection(firestore, 'employees')),
          getDocs(query(collection(firestore, 'rawPunches'), where('logDate', '>=', startOfDay), where('logDate', '<=', endOfDay), orderBy('logDate'))),
          getDocs(collection(firestore, 'shifts')),
          getDocs(collection(firestore, 'leaves')),
        ]);

        const shifts = shiftsSnapshot.docs.map((shiftDocument) => shiftDocument.data() as Shift);
        const leaves = leavesSnapshot.docs.map((leaveDocument) => leaveDocument.data() as LeaveRecord);

        const employees = employeesSnapshot.docs
          .map((employee) => employee.data() as Employee)
          .filter((employee) => !branchFilter || employee.workLocation === branchFilter)
          .filter((employee) => isEmployeeActiveOnDate(employee, selectedDate));
        const hasActiveEmployees = employees.length > 0;
        const employeeByCode = new Map<string, Employee>();
        const branchEmployeeCodes = new Set<string>();
        employees.forEach((employee) => {
          [employee.employeeCodeInDevice, employee.employeeCode].forEach((code) => {
            if (!code) return;
            const normalized = code.trim().toLowerCase();
            employeeByCode.set(normalized, employee);
            branchEmployeeCodes.add(normalized);
          });
        });

        const shiftTimesByEmployee = new Map<string, string>();
        shifts.forEach((shift) => {
          shift.employees?.forEach((shiftEmployee) => {
            const employeeCode = shiftEmployee.employeeCode?.trim().toLowerCase();
            if (!employeeCode || !branchEmployeeCodes.has(employeeCode)) return;
            const isAssignedForDate = (!shiftEmployee.fromDate || selectedDate >= shiftEmployee.fromDate)
              && (!shiftEmployee.toDate || selectedDate <= shiftEmployee.toDate);
            if (isAssignedForDate && !shiftTimesByEmployee.has(employeeCode)) {
              shiftTimesByEmployee.set(employeeCode, `${shift.startTime || '—'} - ${shift.endTime || '—'}`);
            }
          });
        });

        const attendanceByDesignation = new Map<string, Set<string>>();
        const totalEmployeesByDesignation = new Map<string, Set<string>>();
        const attendanceByDepartment = new Map<string, Set<string>>();
        const totalEmployeesByDepartment = new Map<string, Set<string>>();
        
        const addEmployeeToAttendance = (employee: Employee) => {
          const employeeCode = getStableEmployeeCode(employee);
          if (!employeeCode) return;

          const designation = employee.designation?.trim() || 'Unassigned Designation';
          if (!attendanceByDesignation.has(designation)) attendanceByDesignation.set(designation, new Set());
          attendanceByDesignation.get(designation)!.add(employeeCode);
          
          const department = employee.department?.trim() || 'Unassigned Department';
          if (!attendanceByDepartment.has(department)) attendanceByDepartment.set(department, new Set());
          attendanceByDepartment.get(department)!.add(employeeCode);
        };
        
        // Track total employees per designation and department
        employees.forEach((employee) => {
          const employeeCode = getStableEmployeeCode(employee);
          if (!employeeCode) return;
          
          const designation = employee.designation?.trim() || 'Unassigned Designation';
          if (!totalEmployeesByDesignation.has(designation)) totalEmployeesByDesignation.set(designation, new Set());
          totalEmployeesByDesignation.get(designation)!.add(employeeCode);
          
          const department = employee.department?.trim() || 'Unassigned Department';
          if (!totalEmployeesByDepartment.has(department)) totalEmployeesByDepartment.set(department, new Set());
          totalEmployeesByDepartment.get(department)!.add(employeeCode);
        });

        let hasAnyShiftAssignments = false;

        if (isFutureDate(selectedDate)) {
          shifts.forEach((shift) => {
            shift.employees?.forEach((shiftEmployee) => {
              const employeeCode = shiftEmployee.employeeCode?.trim().toLowerCase();
              if (!employeeCode || !branchEmployeeCodes.has(employeeCode)) return;
              const isAssignedForDate = (!shiftEmployee.fromDate || selectedDate >= shiftEmployee.fromDate)
                && (!shiftEmployee.toDate || selectedDate <= shiftEmployee.toDate);
              if (!isAssignedForDate) return;
              hasAnyShiftAssignments = true;

              const employee = employeeByCode.get(employeeCode);
              if (!employee) return;

              // Exclude employees on approved full-day leave or weekly off.
              if (isOnLeaveOrWeekOff(employeeCode, selectedDate, leaves)) return;

              addEmployeeToAttendance(employee);
            });
          });
        } else {
          punchesSnapshot.docs.forEach((punchDocument) => {
            const punch = punchDocument.data() as RawPunch;
            const employeeCode = punch.userId?.trim().toLowerCase();
            if (!employeeCode || !branchEmployeeCodes.has(employeeCode)) return;

            // Attribute the punch to the correct attendance day, matching the logic
            // used by /attendance/records. This ensures night-shift out-punches that
            // occur after midnight are counted for the previous day.
            const attendanceDate = getAttendanceDate(punch, shifts);
            if (attendanceDate !== selectedDate) return;

            const employee = employeeByCode.get(employeeCode);
            if (employee) addEmployeeToAttendance(employee);
          });
        }

        const designationColors = new Map(
          Array.from(attendanceByDesignation.keys())
            .sort()
            .map((designation, index) => [designation, CHART_COLORS[index % CHART_COLORS.length]]),
        );
        const departmentColors = new Map(
          Array.from(attendanceByDepartment.keys())
            .sort()
            .map((department, index) => [department, CHART_COLORS[index % CHART_COLORS.length]]),
        );
        
        const designationData = Array.from(attendanceByDesignation.entries())
          .map(([label, employeesPresent]) => ({
            label,
            value: employeesPresent.size,
            total: totalEmployeesByDesignation.get(label)?.size || employeesPresent.size,
            color: designationColors.get(label) || CHART_COLORS[0],
          }))
          .sort((first, second) => second.value - first.value);
          
        const departmentChartData = Array.from(attendanceByDepartment.entries())
          .map(([label, employeesPresent]) => ({
            label,
            value: employeesPresent.size,
            total: totalEmployeesByDepartment.get(label)?.size || employeesPresent.size,
            color: departmentColors.get(label) || CHART_COLORS[0],
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
        
        const employeesByDepartment = Object.fromEntries(
          Array.from(attendanceByDepartment.entries()).map(([department, employeeCodes]) => [
            department,
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
        const emptyText = !hasActiveEmployees
          ? 'No active employees for this date.'
          : isFutureDate(selectedDate)
            ? hasAnyShiftAssignments
              ? 'No employees scheduled to work on this date.'
              : 'No shifts assigned for this date.'
            : 'No data. No punches yet for this date.';
        
        setCharts([{
          key: ALL_EMPLOYEES_KEY,
          title: 'All Employees',
          data: designationData,
          employeesByDesignation,
          employeesByDepartment,
          departmentData: departmentChartData,
          emptyText,
        }]);
      } catch (error) {
        console.error('Error fetching attendance insights:', error);
        setError('Failed to load attendance insights. Please try again.');
        setCharts([]);
      } finally {
        setAttendanceLoading(false);
      }
    };

    fetchAttendanceInsights();
  }, [selectedDate, branchFilter, branchesLoading]);

  const handleDesignationClick = (chart: AttendanceChart, designation: string) => {
    const employees = chart.employeesByDesignation[designation] ?? [];
    if (employees.length > 0) setSelectedGroup({ chartTitle: chart.title, groupLabel: designation, employees });
  };

  const handleDepartmentClick = (chart: AttendanceChart, department: string) => {
    const employees = chart.employeesByDepartment?.[department] ?? [];
    if (employees.length > 0) setSelectedGroup({ chartTitle: chart.title, groupLabel: department, employees });
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
                disabled={userData?.designation === 'Branch Manager' || branchesLoading}
                className="w-full px-3 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-secondary-100 disabled:cursor-not-allowed"
              >
                {branchesLoading ? (
                  <option value="">Loading branches...</option>
                ) : userData?.designation === 'Branch Manager' ? (
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
          {attendanceLoading || branchesLoading ? (
            <div className="text-center py-8 text-secondary-500 flex flex-col items-center gap-2">
              <RedSpinner />
              <span>{branchesLoading ? 'Loading branches...' : 'Loading attendance insights...'}</span>
            </div>
          ) : error ? (
            <div className="card p-6 text-center border-red-200 bg-red-50 text-red-700">
              <p className="font-medium">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-3 px-4 py-2 text-sm font-medium bg-white border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              {charts.map((chart) => (
                <PieChart
                  key={chart.key}
                  title={chart.title}
                  data={chart.data}
                  emptyText={chart.emptyText}
                  onLabelClick={(designation) => handleDesignationClick(chart, designation)}
                  departmentData={chart.departmentData}
                  onDepartmentLabelClick={(department) => handleDepartmentClick(chart, department)}
                  className="xl:col-span-2"
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-secondary-200 p-5">
              <div>
                <h2 className="text-lg font-semibold text-secondary-900">{selectedGroup.groupLabel}</h2>
                <p className="text-sm text-secondary-500">{selectedGroup.chartTitle}</p>
              </div>
              <button
                onClick={() => setSelectedGroup(null)}
                className="rounded-lg p-1.5 text-secondary-500 hover:bg-secondary-100 hover:text-secondary-900"
                aria-label="Close employee list"
              >
                <X size={20} />
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto p-5">
              <div className="space-y-3">
                {selectedGroup.employees.map((employee) => (
                  <div key={employee.employeeCode} className="rounded-lg border border-secondary-200 p-3">
                    <p className="font-medium text-black">{employee.name}</p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-secondary-500">
                      <span className="text-indigo-700">{employee.employeeCode}</span>
                      <span className="text-indigo-700">{selectedGroup.groupLabel} ({employee.subDesignation})</span>
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
