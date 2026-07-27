import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lightbulb, X, ArrowLeft } from 'lucide-react';
import { Timestamp, collection, getDocs, getFirestore, orderBy, query, where } from 'firebase/firestore';
import { PageContainer } from '@/components/common';
import { PieChart } from '@/pages/DMS/dashboard/PieChart';

interface BranchManager {
  id: string;
  name: string;
}

interface Employee {
  employeeCode?: string;
  employeeCodeInDevice?: string;
  employeeName?: string;
  designation?: string;
  subDesignation?: string;
  branchManagerId?: string;
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

const UNASSIGNED_MANAGER_KEY = 'unassigned';
const CHART_COLORS = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#db2777', '#0891b2', '#ca8a04', '#4f46e5'];

const getToday = (): string => {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
};

export const InsightsPage: React.FC = () => {
  const navigate = useNavigate();
  const [branchManagers, setBranchManagers] = useState<BranchManager[]>([]);
  const [selectedManagerId, setSelectedManagerId] = useState('');
  const [selectedDate, setSelectedDate] = useState(getToday);
  const [managerCharts, setManagerCharts] = useState<ManagerChart[]>([]);
  const [loading, setLoading] = useState(true);
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [selectedDesignation, setSelectedDesignation] = useState<{ chartTitle: string; designation: string; employees: ChartEmployee[] } | null>(null);

  useEffect(() => {
    const fetchBranchManagers = async () => {
      try {
        const snapshot = await getDocs(
          query(collection(getFirestore(), 'users'), where('designation', '==', 'Branch Manager'), orderBy('name')),
        );
        setBranchManagers(snapshot.docs.map((manager) => ({ id: manager.id, name: manager.data().name || 'Unnamed' })));
      } catch (error) {
        console.error('Error fetching branch managers:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBranchManagers();
  }, []);

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

        const employees = employeesSnapshot.docs.map((employee) => employee.data() as Employee);
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

        const visibleManagers = selectedManagerId
          ? branchManagers.filter((manager) => manager.id === selectedManagerId)
          : branchManagers;
        const visibleManagerIds = new Set(visibleManagers.map((manager) => manager.id));
        const employeesByChart = new Map<string, Employee[]>();
        visibleManagers.forEach((manager) => employeesByChart.set(manager.id, []));
        employeesByChart.set(UNASSIGNED_MANAGER_KEY, []);
        employees.forEach((employee) => {
          const chartKey = !employee.branchManagerId
            ? UNASSIGNED_MANAGER_KEY
            : visibleManagerIds.has(employee.branchManagerId)
              ? employee.branchManagerId
              : null;
          if (chartKey) employeesByChart.get(chartKey)!.push(employee);
        });

        const attendanceByManager = new Map<string, Map<string, Set<string>>>();
        [...visibleManagers.map((manager) => manager.id), UNASSIGNED_MANAGER_KEY]
          .forEach((managerId) => attendanceByManager.set(managerId, new Map()));
        const getChartKey = (employee: Employee): string | null => {
          if (!employee.branchManagerId) return UNASSIGNED_MANAGER_KEY;
          return visibleManagerIds.has(employee.branchManagerId) ? employee.branchManagerId : null;
        };
        const addEmployeeToAttendance = (employee: Employee, employeeCode: string) => {
          const chartKey = getChartKey(employee);
          if (!chartKey) return;

          const designation = employee.designation?.trim() || 'Unassigned Designation';
          const attendanceByDesignation = attendanceByManager.get(chartKey)!;
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
          Array.from(new Set(
            Array.from(attendanceByManager.values()).flatMap((attendanceByDesignation) => Array.from(attendanceByDesignation.keys())),
          )).sort().map((designation, index) => [designation, CHART_COLORS[index % CHART_COLORS.length]]),
        );
        const chartDefinitions = [
          ...visibleManagers.map((manager) => ({
            key: manager.id,
            title: manager.name.replace(/\s*Manager\s*$/i, '') || manager.name,
          })),
          { key: UNASSIGNED_MANAGER_KEY, title: 'Unspecified' },
        ];
        setManagerCharts(chartDefinitions.map((chart) => {
          const attendanceByDesignation = attendanceByManager.get(chart.key)!;
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
          const hasEmployees = (employeesByChart.get(chart.key) ?? []).length > 0;
          const emptyText = !hasEmployees
            ? chart.key === UNASSIGNED_MANAGER_KEY
              ? 'No data. No employees are unassigned; please assign employees to a manager.'
              : 'No data. Please assign employees to this manager.'
            : selectedDate > getToday()
              ? 'No data. Please assign shifts to the employees.'
              : 'No data. No punches yet for this date.';
          return { ...chart, data, employeesByDesignation, emptyText };
        }));
      } catch (error) {
        console.error('Error fetching attendance insights:', error);
        setManagerCharts([]);
      } finally {
        setAttendanceLoading(false);
      }
    };

    fetchAttendanceInsights();
  }, [branchManagers, selectedDate, selectedManagerId]);

  const handleDesignationClick = (chart: ManagerChart, designation: string) => {
    const employees = chart.employeesByDesignation[designation] ?? [];
    if (employees.length > 0) setSelectedDesignation({ chartTitle: chart.title, designation, employees });
  };

  return (
    <PageContainer>
      <div className="mt-4 flex items-center gap-3 px-4 py-3 bg-white border-b border-secondary-200">
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
              <p className="text-sm text-secondary-500">Select a branch manager to view their insights.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="branch-manager" className="block mb-2 text-sm font-medium text-secondary-700">
                Branch Manager
              </label>
              <select
                id="branch-manager"
                value={selectedManagerId}
                onChange={(event) => setSelectedManagerId(event.target.value)}
                disabled={loading}
                className="w-full px-3 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-secondary-100"
              >
                <option value="">{loading ? 'Loading branch managers...' : 'All Branch Managers'}</option>
                {branchManagers.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.name}
                  </option>
                ))}
              </select>
            </div>
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
          </div>
        </div>

        <div className="mt-6">
          {attendanceLoading ? (
            <div className="text-center py-8 text-secondary-500">Loading attendance insights...</div>
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
