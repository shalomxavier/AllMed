import { useEffect, useMemo, useState } from 'react';
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

interface DepartmentShiftCounts {
  morning: number;
  mid: number;
  night: number;
}

const CHART_COLORS = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#db2777', '#0891b2', '#ca8a04', '#4f46e5'];

const SHIFT_WINDOWS = [
  { key: 'morning', start: 8 * 60, end: 16 * 60 },
  { key: 'mid', start: 16 * 60, end: 24 * 60 },
  { key: 'night', start: 22 * 60, end: 32 * 60 }, // 10 PM to 8 AM next day
] as const;

const categorizeShiftTime = (shiftTime: string): Array<keyof DepartmentShiftCounts> => {
  const [startStr, endStr] = shiftTime.split('-').map((s) => s.trim());
  if (!startStr || !endStr) return [];

  const [startHour, startMinute] = startStr.split(':').map(Number);
  const [endHour, endMinute] = endStr.split(':').map(Number);
  if ([startHour, startMinute, endHour, endMinute].some((value) => Number.isNaN(value))) return [];

  let start = startHour * 60 + startMinute;
  let end = endHour * 60 + endMinute;
  if (end <= start) end += 24 * 60;

  const overlaps = SHIFT_WINDOWS.map((window) => ({
    key: window.key,
    overlap: Math.max(0, Math.min(end, window.end) - Math.max(start, window.start)),
  }));

  const maxOverlap = Math.max(0, ...overlaps.map((item) => item.overlap));
  if (maxOverlap === 0) return [];
  return overlaps.filter((item) => item.overlap === maxOverlap).map((item) => item.key);
};

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
  const matches = shifts.filter((shift) => shift.employees?.some((emp) => {
    const code = emp.employeeCode?.trim().toLowerCase();
    return code === key
      && (!emp.fromDate || dateStr >= emp.fromDate)
      && (!emp.toDate || dateStr <= emp.toDate);
  }));
  if (matches.length > 1) console.error('Multiple shifts cover employee date:', employeeCode, dateStr, matches);
  return matches.length === 1 ? matches[0] : null;
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

const SHIFT_COLUMNS: { key: keyof DepartmentShiftCounts; title: string; sub: string; headerBg: string; headerText: string }[] = [
  { key: 'morning', title: 'Morning', sub: '8 AM–4 PM', headerBg: 'bg-green-100', headerText: 'text-green-800' },
  { key: 'mid', title: 'Mid', sub: '4 PM–12 AM', headerBg: 'bg-orange-100', headerText: 'text-orange-800' },
  { key: 'night', title: 'Night', sub: '10 PM–8 AM', headerBg: 'bg-indigo-100', headerText: 'text-indigo-800' },
];

const DepartmentShiftTable: React.FC<{ rows: [string, DepartmentShiftCounts][]; employeesByDepartment: Record<string, ChartEmployee[]> }> = ({ rows, employeesByDepartment }) => {
  const totals = useMemo(() => rows.reduce((acc, [, counts]) => {
    acc.morning += counts.morning;
    acc.mid += counts.mid;
    acc.night += counts.night;
    return acc;
  }, { morning: 0, mid: 0, night: 0 }), [rows]);

  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const selectedEmployees = selectedDepartment ? employeesByDepartment[selectedDepartment] ?? [] : [];

  if (rows.length === 0) return null;

  return (
    <>
      <div className="card p-5 bg-white border border-secondary-200 mb-6">
        <h3 className="text-lg font-semibold text-secondary-900 mb-4">Department-wise Shift Availability</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-secondary-900">
                <th className="px-4 py-3 text-left text-base font-bold bg-secondary-200 border border-secondary-200">Department</th>
                {SHIFT_COLUMNS.map((col) => (
                  <th key={col.key} className={`px-4 py-3 text-center text-base font-bold border border-secondary-200 ${col.headerBg} ${col.headerText}`}>
                    <div>{col.title}</div>
                    <div className="text-xs font-normal opacity-80">{col.sub}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([department, counts]) => {
                const hasEmployees = (employeesByDepartment[department]?.length ?? 0) > 0;
                return (
                  <tr
                    key={department}
                    onClick={() => hasEmployees && setSelectedDepartment(department)}
                    className={`border-b border-secondary-200 ${hasEmployees ? 'cursor-pointer hover:bg-secondary-100' : 'hover:bg-secondary-50'}`}
                  >
                    <td className="px-3 py-2 font-medium text-secondary-900 border border-secondary-200">{department}</td>
                    {SHIFT_COLUMNS.map((col) => (
                      <td key={col.key} className="px-3 py-2 text-center font-semibold text-secondary-900 border border-secondary-200">
                        {counts[col.key]}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-secondary-100 font-semibold text-secondary-900">
                <td className="px-3 py-2 border border-secondary-200">Total</td>
                {SHIFT_COLUMNS.map((col) => (
                  <td key={col.key} className="px-3 py-2 text-center font-semibold text-secondary-900 border border-secondary-200">
                    {totals[col.key]}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {selectedDepartment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelectedDepartment(null)}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-secondary-200 p-5">
              <div>
                <h2 className="text-lg font-semibold text-secondary-900">{selectedDepartment}</h2>
                <p className="text-sm text-secondary-500">Employee shift breakdown</p>
              </div>
              <button
                onClick={() => setSelectedDepartment(null)}
                className="rounded-lg p-1.5 text-secondary-500 hover:bg-secondary-100 hover:text-secondary-900"
                aria-label="Close employee shift breakdown"
              >
                <X size={20} />
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto p-5">
              {selectedEmployees.length === 0 ? (
                <p className="text-center text-secondary-500 py-8">No employees to display.</p>
              ) : (
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-secondary-900">
                      <th className="px-3 py-2 text-left font-semibold bg-secondary-200 border border-secondary-200">Employee</th>
                      {SHIFT_COLUMNS.map((col) => (
                        <th key={col.key} className={`px-3 py-2 text-center font-semibold border border-secondary-200 ${col.headerBg} ${col.headerText}`}>
                          <div>{col.title}</div>
                          <div className="text-xs font-normal opacity-80">{col.sub}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedEmployees.map((employee) => {
                      const buckets = categorizeShiftTime(employee.shiftTime || '');
                      return (
                        <tr key={employee.employeeCode} className="border-b border-secondary-200">
                          <td className="px-3 py-2 font-medium text-secondary-900 border border-secondary-200">{employee.name}</td>
                          {SHIFT_COLUMNS.map((col) => (
                            <td key={col.key} className="px-3 py-2 text-center border border-secondary-200">
                              {buckets.includes(col.key) && (
                                <span className="inline-block w-4 h-4 rounded-full bg-green-500" />
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const InsightsPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, userData } = useAuthContext();
  const [selectedDate, setSelectedDate] = useState(getToday);
  const [charts, setCharts] = useState<AttendanceChart[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<{ chartTitle: string; groupLabel: string; employees: ChartEmployee[] } | null>(null);
  const [departmentShiftRows, setDepartmentShiftRows] = useState<[string, DepartmentShiftCounts][]>([]);
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

        // 1. Fetch employees first. When a branch is selected, ask Firestore to filter
        // so we do not read the entire company roster on every date change.
        const employeesQuery = branchFilter
          ? query(collection(firestore, 'employees'), where('workLocation', '==', branchFilter))
          : collection(firestore, 'employees');
        const employeesSnapshot = await getDocs(employeesQuery);

        const employees = employeesSnapshot.docs
          .map((employee) => employee.data() as Employee)
          .filter((employee) => isEmployeeActiveOnDate(employee, selectedDate));
        const hasActiveEmployees = employees.length > 0;

        // If a specific branch is selected but has no active employees on this date,
        // skip the remaining fetches and show zero results.
        if (branchFilter && employees.length === 0) {
          setCharts([{
            key: ALL_EMPLOYEES_KEY,
            title: 'All Employees',
            data: [],
            employeesByDesignation: {},
            employeesByDepartment: {},
            departmentData: [],
            emptyText: 'No active employees for this date.',
          }]);
          setDepartmentShiftRows([]);
          setAttendanceLoading(false);
          return;
        }

        const employeeByCode = new Map<string, Employee>();
        const branchEmployeeCodes = new Set<string>();
        const branchUserIdSet = new Set<string>();
        employees.forEach((employee) => {
          [employee.employeeCodeInDevice, employee.employeeCode].forEach((code) => {
            if (!code) return;
            const normalized = code.trim().toLowerCase();
            employeeByCode.set(normalized, employee);
            branchEmployeeCodes.add(normalized);
            // Keep the original casing for the Firestore 'in' filter, which is
            // case-sensitive — rawPunches.userId is stored as e.g. 'BR012'.
            branchUserIdSet.add(code.trim());
          });
        });

        // Build the list of user IDs to query. Firestore 'in' supports up to 30 values.
        const branchUserIds = Array.from(branchUserIdSet);
        const canFilterByUserIds = branchFilter && branchUserIds.length > 0 && branchUserIds.length <= 30;

        // 2. Fetch punches, leaves, and shifts. Use 'in' filters when we have a small,
        // known set of employee codes for the selected branch to avoid reading unrelated
        // documents. Shifts are an array-of-objects in each document, so they still
        // require in-memory filtering unless we later denormalize employeeCodes.
        // Expand the punch query by one day on each side so night-shift out-punches on
        // adjacent calendar days are included (same as /attendance/records).
        const queryFrom = shiftDate(selectedDate, -1);
        const queryTo = shiftDate(selectedDate, 1);
        const startOfDay = Timestamp.fromDate(new Date(`${queryFrom}T00:00:00Z`));
        const endOfDay = Timestamp.fromDate(new Date(`${queryTo}T23:59:59.999Z`));

        const punchesQuery = canFilterByUserIds
          ? query(
              collection(firestore, 'rawPunches'),
              where('logDate', '>=', startOfDay),
              where('logDate', '<=', endOfDay),
              where('userId', 'in', branchUserIds),
              orderBy('logDate')
            )
          : query(
              collection(firestore, 'rawPunches'),
              where('logDate', '>=', startOfDay),
              where('logDate', '<=', endOfDay),
              orderBy('logDate')
            );

        const leavesQuery = canFilterByUserIds
          ? query(collection(firestore, 'leaves'), where('employeeCode', 'in', branchUserIds))
          : collection(firestore, 'leaves');

        const [punchesSnapshot, shiftsSnapshot, leavesSnapshot] = await Promise.all([
          getDocs(punchesQuery),
          getDocs(collection(firestore, 'shifts')),
          getDocs(leavesQuery),
        ]);

        const shifts = shiftsSnapshot.docs.map((shiftDocument) => shiftDocument.data() as Shift);
        const leaves = leavesSnapshot.docs.map((leaveDocument) => leaveDocument.data() as LeaveRecord);

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

        const departmentShiftMap = new Map<string, DepartmentShiftCounts>();
        totalEmployeesByDepartment.forEach((_, department) => {
          departmentShiftMap.set(department, { morning: 0, mid: 0, night: 0 });
        });
        attendanceByDepartment.forEach((codes, department) => {
          const counts = departmentShiftMap.get(department) ?? { morning: 0, mid: 0, night: 0 };
          codes.forEach((code) => {
            const buckets = categorizeShiftTime(shiftTimesByEmployee.get(code) || '');
            buckets.forEach((bucket) => counts[bucket]++);
          });
          departmentShiftMap.set(department, counts);
        });

        const sortedDepartmentShiftRows = Array.from(departmentShiftMap.entries()).sort(([deptA, countsA], [deptB, countsB]) => {
          const totalA = countsA.morning + countsA.mid + countsA.night;
          const totalB = countsB.morning + countsB.mid + countsB.night;
          if (totalB !== totalA) return totalB - totalA;
          return deptA.localeCompare(deptB);
        });
        setDepartmentShiftRows(sortedDepartmentShiftRows);
      } catch (error) {
        console.error('Error fetching attendance insights:', error);
        setError('Failed to load attendance insights. Please try again.');
        setCharts([]);
        setDepartmentShiftRows([]);
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
      <div className="mt-4 flex items-center gap-3 py-3">
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
                className="w-full px-3 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
                className="w-full px-3 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-secondary-100 disabled:cursor-not-allowed"
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
                <div key={chart.key} className="xl:col-span-2 flex flex-col gap-4">
                  <PieChart
                    title={chart.title}
                    data={chart.data}
                    emptyText={chart.emptyText}
                    onLabelClick={(designation) => handleDesignationClick(chart, designation)}
                    departmentData={chart.departmentData}
                    onDepartmentLabelClick={(department) => handleDepartmentClick(chart, department)}
                  />
                  <DepartmentShiftTable rows={departmentShiftRows} employeesByDepartment={chart.employeesByDepartment ?? {}} />
                </div>
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
