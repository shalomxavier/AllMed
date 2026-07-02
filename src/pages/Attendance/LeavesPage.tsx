import React, { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw, Umbrella, Search, X, AlertTriangle, ChevronLeft, ChevronRight, Palmtree, TrendingDown, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getFirestore, collection, getDocs, query, orderBy, where, addDoc, serverTimestamp } from 'firebase/firestore';
import { useAuthContext } from '@/contexts/AuthContext';

interface LeaveRecord {
  id: string;
  employeeCode?: string;
  employeeName?: string;
  dates?: string[];
  fromDate?: string;
  toDate?: string;
  reason?: string;
  createdAt?: any;
}

interface WeekOffRecord {
  id: string;
  employeeCode?: string;
  employeeName?: string;
  days?: string[];
}

interface RawPunch {
  id: string;
  deviceId?: number;
  deviceLogId?: string;
  direction?: string;
  logDate?: any;
  month?: number;
  year?: number;
  sourceTable?: string;
  userId?: string;
  verificationMode?: string;
}

const ALL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const toDate = (logDate: any): Date | null => {
  if (!logDate) return null;
  if (logDate?.toDate) return logDate.toDate();
  if (logDate instanceof Date) return logDate;
  return null;
};

const getDateKey = (logDate: any): string => {
  const d = toDate(logDate);
  if (!d) return 'unknown';
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

const timeToMinutes = (time24: string): number => {
  const [h, m] = time24.split(':').map(Number);
  return h * 60 + m;
};

const getLeaveColor = (reason?: string) => {
  const r = reason?.toLowerCase() ?? '';
  if (r.includes('sick') || r.includes('medical')) return { bg: 'bg-red-50', text: 'text-red-600', badge: 'bg-red-100' };
  if (r.includes('casual') || r.includes('personal')) return { bg: 'bg-green-50', text: 'text-green-600', badge: 'bg-green-100' };
  if (r.includes('holiday') || r.includes('festival')) return { bg: 'bg-yellow-50', text: 'text-yellow-600', badge: 'bg-yellow-100' };
  if (r.includes('maternity') || r.includes('paternity')) return { bg: 'bg-pink-50', text: 'text-pink-600', badge: 'bg-pink-100' };
  if (r.includes('earned') || r.includes('privilege')) return { bg: 'bg-indigo-50', text: 'text-indigo-600', badge: 'bg-indigo-100' };
  return { bg: 'bg-purple-50', text: 'text-purple-600', badge: 'bg-purple-100' };
};

export const LeavesPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuthContext();
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [weekOffs, setWeekOffs] = useState<WeekOffRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState<{ employeeCode: string; employeeName: string; type: 'type' | 'total'; typeKey?: string; details: any[] } | null>(null);
  const [unauthorizedModalOpen, setUnauthorizedModalOpen] = useState(false);
  const [unauthorizedResults, setUnauthorizedResults] = useState<any[]>([]);
  const [checkingAbsences, setCheckingAbsences] = useState(false);
  const [bulkLeaveModalOpen, setBulkLeaveModalOpen] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [bulkLeaveSelectedIds, setBulkLeaveSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLeaveSearchQuery, setBulkLeaveSearchQuery] = useState('');
  const [bulkLeaveForm, setBulkLeaveForm] = useState({ reason: '' });
  const [bulkLeaveSelectedDates, setBulkLeaveSelectedDates] = useState<string[]>([]);
  const [bulkLeaveCalendarMonth, setBulkLeaveCalendarMonth] = useState(new Date().getMonth());
  const [bulkLeaveCalendarYear, setBulkLeaveCalendarYear] = useState(new Date().getFullYear());
  const [isSavingBulkLeave, setIsSavingBulkLeave] = useState(false);

  const fetchData = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const db = getFirestore();
      const [leavesSnap, weekOffsSnap, employeesSnap] = await Promise.all([
        getDocs(query(collection(db, 'leaves'), orderBy('fromDate', 'desc'))),
        getDocs(collection(db, 'weekOffs')),
        getDocs(query(collection(db, 'employees'), orderBy('employeeName'))),
      ]);
      const leavesData: LeaveRecord[] = [];
      leavesSnap.forEach((d) => leavesData.push({ id: d.id, ...d.data() }));
      const weekOffsData: WeekOffRecord[] = [];
      weekOffsSnap.forEach((d) => weekOffsData.push({ id: d.id, ...d.data() }));
      const employeesData: any[] = [];
      employeesSnap.forEach((d) => employeesData.push({ id: d.id, ...d.data() }));
      setLeaves(leavesData);
      setWeekOffs(weekOffsData);
      setEmployees(employeesData.filter((e) => !e.employeeCodeInDevice?.startsWith('Del')));
    } catch (e) {
      console.error('Error fetching data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [currentUser]);

  const closeBulkLeaveModal = () => {
    setBulkLeaveModalOpen(false);
    setBulkLeaveSelectedIds(new Set());
    setBulkLeaveSearchQuery('');
    setBulkLeaveForm({ reason: '' });
    setBulkLeaveSelectedDates([]);
    setBulkLeaveCalendarMonth(new Date().getMonth());
    setBulkLeaveCalendarYear(new Date().getFullYear());
  };

  const toggleBulkLeaveEmployee = (id: string) => {
    setBulkLeaveSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (bulkLeaveSelectedIds.size === 0 || bulkLeaveSelectedDates.length === 0 || !bulkLeaveForm.reason) return;
    setIsSavingBulkLeave(true);
    try {
      const db = getFirestore();
      const sorted = [...bulkLeaveSelectedDates].sort();
      for (const empId of bulkLeaveSelectedIds) {
        const employee = employees.find((e) => e.id === empId);
        if (!employee) continue;
        await addDoc(collection(db, 'leaves'), {
          employeeId: employee.id,
          employeeCode: employee.employeeCode,
          employeeName: employee.employeeName,
          dates: sorted,
          fromDate: sorted[0],
          toDate: sorted[sorted.length - 1],
          reason: bulkLeaveForm.reason,
          createdAt: serverTimestamp(),
          createdBy: currentUser?.uid,
        });
      }
      fetchData();
      closeBulkLeaveModal();
    } catch (err) {
      console.error('Error saving bulk leave:', err);
    } finally {
      setIsSavingBulkLeave(false);
    }
  };

  const checkUnauthorizedAbsences = async () => {
    if (!currentUser) return;
    setCheckingAbsences(true);
    try {
      const db = getFirestore();
      const PERIOD_END = new Date('2026-06-10');
      const PERIOD_START = new Date('2026-06-10');
      PERIOD_START.setDate(PERIOD_START.getDate() - 29);

      // Fetch all shifts
      const shiftsSnap = await getDocs(collection(db, 'shifts'));
      const shifts: any[] = [];
      shiftsSnap.forEach((d) => shifts.push({ id: d.id, ...d.data() }));

      // Fetch all employees
      const employeesSnap = await getDocs(collection(db, 'employees'));
      const employeesMap: Record<string, any> = {};
      employeesSnap.forEach((d) => {
        const data = d.data();
        if (data.employeeCode) {
          employeesMap[data.employeeCode] = { id: d.id, ...data };
        }
      });

      // Fetch all leaves
      const leavesSnap = await getDocs(collection(db, 'leaves'));
      const leavesData: LeaveRecord[] = [];
      leavesSnap.forEach((d) => leavesData.push({ id: d.id, ...d.data() }));

      // Fetch raw punches for 2026 and filter by month in memory
      const punchesSnap = await getDocs(query(collection(db, 'rawPunches'), where('year', '==', 2026)));
      const punchesByEmp: Record<string, RawPunch[]> = {};
      punchesSnap.forEach((d) => {
        const data = { id: d.id, ...d.data() } as RawPunch;
        if (data.month !== 5 && data.month !== 6) return;
        const empCode = data.userId ?? '';
        if (!punchesByEmp[empCode]) punchesByEmp[empCode] = [];
        punchesByEmp[empCode].push(data);
      });

      const results: any[] = [];
      const empCodesWithShifts = new Set<string>();
      shifts.forEach((shift) => {
        (shift.employees ?? []).forEach((emp: any) => {
          if (emp.employeeCode) empCodesWithShifts.add(emp.employeeCode);
        });
      });

      empCodesWithShifts.forEach((empCode) => {
        const employee = employeesMap[empCode];
        const empName = employee?.employeeName ?? empCode;

        const empShifts = shifts.filter((shift) => {
          return (shift.employees ?? []).some((e: any) => e.employeeCode === empCode);
        });

        const empLeaves = leavesData.filter((l) => l.employeeCode === empCode);
        const leaveDates = new Set<string>();
        empLeaves.forEach((l) => {
          const dates = l.dates ?? (l.fromDate ? [l.fromDate] : []);
          dates.forEach((date) => leaveDates.add(date));
        });

        const empPunches = punchesByEmp[empCode] ?? [];

        for (let d = new Date(PERIOD_START); d <= PERIOD_END; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split('T')[0];
          const dayName = ALL_DAYS[d.getDay()];

          // Find applicable shift for this date
          const shift = empShifts.find((s) => {
            const entry = (s.employees ?? []).find((e: any) => e.employeeCode === empCode);
            if (!entry) return false;
            const fromDate = entry.fromDate ?? '';
            const toDate = entry.toDate ?? '';
            if (!fromDate && !toDate) return true;
            if (fromDate && !toDate) return dateStr === fromDate;
            if (!fromDate && toDate) return dateStr === toDate;
            return dateStr >= fromDate && dateStr <= toDate;
          });

          if (!shift) continue;

          // Skip approved leave days
          if (leaveDates.has(dateStr)) continue;

          // Skip week-offs
          const wo = weekOffs.find((w) => w.employeeCode === empCode);
          if (wo?.days?.includes(dayName)) continue;

          const startMinutes = timeToMinutes(shift.startTime ?? '00:00');
          const endMinutes = timeToMinutes(shift.endTime ?? '00:00');
          const isNightShift = endMinutes <= startMinutes;

          // Clock-in date is the scheduled workday
          const hasIn = empPunches.some((p) => {
            if (p.direction !== 'in') return false;
            return getDateKey(p.logDate) === dateStr;
          });

          // Clock-out date is the same day for day shifts, next day for night shifts
          const outDate = new Date(dateStr);
          if (isNightShift) outDate.setDate(outDate.getDate() + 1);
          const outDateStr = outDate.toISOString().split('T')[0];

          const hasOut = empPunches.some((p) => {
            if (p.direction !== 'out') return false;
            return getDateKey(p.logDate) === outDateStr;
          });

          if (!hasIn || !hasOut) {
            results.push({
              employeeCode: empCode,
              employeeName: empName,
              date: dateStr,
              shiftStart: shift.startTime,
              shiftEnd: shift.endTime,
              missingIn: !hasIn,
              missingOut: !hasOut,
              isNightShift,
            });
          }
        }
      });

      setUnauthorizedResults(results);
      setUnauthorizedModalOpen(true);
    } catch (e) {
      console.error('Error checking unauthorized absences:', e);
    } finally {
      setCheckingAbsences(false);
    }
  };

  // Calculate last 30 days date
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Count leaves by employee and type in last 30 days
  const leaveCountsByEmployee = new Map<string, Map<string, number>>();
  leaves.forEach((leave) => {
    const empCode = leave.employeeCode ?? '';
    const dates: string[] = leave.dates ?? (leave.fromDate ? [leave.fromDate] : []);
    const reason = leave.reason?.toLowerCase() ?? 'other';
    const typeKey = reason.includes('sick') || reason.includes('medical') ? 'sick' :
                   reason.includes('casual') || reason.includes('personal') ? 'casual' :
                   reason.includes('holiday') || reason.includes('festival') ? 'holiday' :
                   reason.includes('maternity') || reason.includes('paternity') ? 'maternity' :
                   reason.includes('earned') || reason.includes('privilege') ? 'earned' : 'other';
    
    const count = dates.filter((d) => new Date(d) >= thirtyDaysAgo).length;
    if (count > 0) {
      if (!leaveCountsByEmployee.has(empCode)) {
        leaveCountsByEmployee.set(empCode, new Map());
      }
      const empMap = leaveCountsByEmployee.get(empCode)!;
      empMap.set(typeKey, (empMap.get(typeKey) ?? 0) + count);
    }
  });

  // Count total leaves + week-off days by employee in last 30 days
  const totalDaysByEmployee = new Map<string, number>();
  leaves.forEach((leave) => {
    const empCode = leave.employeeCode ?? '';
    const dates: string[] = leave.dates ?? (leave.fromDate ? [leave.fromDate] : []);
    const count = dates.filter((d) => new Date(d) >= thirtyDaysAgo).length;
    if (count > 0) {
      totalDaysByEmployee.set(empCode, (totalDaysByEmployee.get(empCode) ?? 0) + count);
    }
  });
  weekOffs.forEach((wo) => {
    const empCode = wo.employeeCode ?? '';
    const days = wo.days ?? [];
    // Count how many of the week-off days fall in the last 30 days
    const count = days.filter((dayName) => {
      const dayIndex = ALL_DAYS.indexOf(dayName);
      if (dayIndex === -1) return false;
      let dayCount = 0;
      for (let i = 0; i < 30; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        if (d.getDay() === dayIndex) dayCount++;
      }
      return dayCount > 0;
    }).length;
    if (count > 0) {
      totalDaysByEmployee.set(empCode, (totalDaysByEmployee.get(empCode) ?? 0) + count);
    }
  });

  // Flatten all records into a single list
  const allRecords: Array<{ type: 'leave' | 'weekoff'; data: LeaveRecord | WeekOffRecord }> = [
    ...leaves.map((l) => ({ type: 'leave' as const, data: l })),
    ...weekOffs.map((w) => ({ type: 'weekoff' as const, data: w })),
  ];

  const filtered = allRecords.filter((r) => {
    const name = (r.data as any).employeeName?.toLowerCase() ?? '';
    const code = (r.data as any).employeeCode?.toLowerCase() ?? '';
    return name.includes(searchQuery.toLowerCase()) || code.includes(searchQuery.toLowerCase());
  });

  return (
    <div className="flex flex-col h-full bg-secondary-50">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-secondary-200">
        <button onClick={() => navigate('/attendance')} className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors">
          <ArrowLeft size={20} className="text-secondary-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-semibold text-secondary-900">Week Off / Leave</h1>
          <p className="text-xs text-secondary-500">All employee leaves and week-off schedules</p>
        </div>
        <button onClick={fetchData} className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors">
          <RefreshCw size={18} className={`text-secondary-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 pt-3 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400" />
            <input
              type="text"
              placeholder="Search by name or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-secondary-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-300"
            />
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <button onClick={() => setBulkLeaveModalOpen(true)} className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors shrink-0">
              <Umbrella size={16} />
              Add Leaves
            </button>
            <button onClick={checkUnauthorizedAbsences} disabled={checkingAbsences} className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors shrink-0 disabled:opacity-70">
              {checkingAbsences ? <RefreshCw size={16} className="animate-spin" /> : <AlertTriangle size={16} />}
              Check Unauthorized Absence
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-wrap gap-3 content-start">
        {loading ? (
          <div className="w-full flex items-center justify-center py-16">
            <div className="w-7 h-7 border-2 border-secondary-300 border-t-purple-600 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="w-full flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mb-3">
              <Umbrella className="w-8 h-8 text-purple-400" />
            </div>
            <p className="text-sm font-medium text-secondary-700">No records found</p>
          </div>
        ) : (
          filtered.map((record) => {
            const data = record.data as any;
            if (record.type === 'leave') {
              const dates: string[] = data.dates ?? (data.fromDate ? [data.fromDate] : []);
              const colors = getLeaveColor(data.reason);
              const empCode = data.employeeCode ?? '';
              const reason = data.reason?.toLowerCase() ?? 'other';
              const typeKey = reason.includes('sick') || reason.includes('medical') ? 'sick' :
                             reason.includes('casual') || reason.includes('personal') ? 'casual' :
                             reason.includes('holiday') || reason.includes('festival') ? 'holiday' :
                             reason.includes('maternity') || reason.includes('paternity') ? 'maternity' :
                             reason.includes('earned') || reason.includes('privilege') ? 'earned' : 'other';
              const typeCount = leaveCountsByEmployee.get(empCode)?.get(typeKey) ?? 0;
              const totalCount = totalDaysByEmployee.get(empCode) ?? 0;
              return (
                <div key={record.data.id} className="bg-white border border-purple-700 rounded-xl overflow-hidden cursor-pointer shadow-[0_2px_8px_rgba(126,34,206,0.15)] hover:shadow-[0_4px_16px_rgba(126,34,206,0.35)] transition-shadow w-[300px] h-[200px] shrink-0" onClick={() => {
                          const leaveDetails = leaves
                            .filter((l) => l.employeeCode === empCode)
                            .flatMap((l) => (l.dates ?? (l.fromDate ? [l.fromDate] : [])))
                            .filter((d) => new Date(d) >= thirtyDaysAgo)
                            .map((d) => {
                              const leave = leaves.find((l) => {
                                const dates = l.dates ?? (l.fromDate ? [l.fromDate] : []);
                                return dates.includes(d) && l.employeeCode === empCode;
                              });
                              const reason = leave?.reason?.toLowerCase() ?? 'other';
                              const tk = reason.includes('sick') || reason.includes('medical') ? 'sick' :
                                      reason.includes('casual') || reason.includes('personal') ? 'casual' :
                                      reason.includes('holiday') || reason.includes('festival') ? 'holiday' :
                                      reason.includes('maternity') || reason.includes('paternity') ? 'maternity' :
                                      reason.includes('earned') || reason.includes('privilege') ? 'earned' : 'other';
                              return { date: d, type: 'leave', leaveType: tk.charAt(0).toUpperCase() + tk.slice(1) };
                            });
                          const wo = weekOffs.find((w) => w.employeeCode === empCode);
                          const woDays = wo?.days ?? [];
                          const woDetails: { date: string; type: string }[] = [];
                          for (let i = 0; i < 30; i++) {
                            const d = new Date();
                            d.setDate(d.getDate() - i);
                            const dayName = ALL_DAYS[d.getDay()];
                            if (woDays.includes(dayName)) {
                              woDetails.push({ date: d.toISOString().split('T')[0], type: 'weekoff' });
                            }
                          }
                          const allDetails = [...leaveDetails, ...woDetails].sort((a, b) => b.date.localeCompare(a.date));
                          setModalData({
                            employeeCode: empCode,
                            employeeName: data.employeeName || '',
                            type: 'total',
                            details: allDetails,
                          });
                          setModalOpen(true);
                        }}>
                  <div className="p-3 h-full">
                    <div className="flex flex-col gap-1.5">
                        <p className="text-sm font-semibold text-purple-700 inline-flex items-center gap-1">
                          <Calendar size={13} />
                          {dates.length === 1
                            ? formatDate(dates[0])
                            : `${formatDate(dates[0])} — ${formatDate(dates[dates.length - 1])}`}
                          {dates.length > 1 && <span className="text-xs text-secondary-500 ml-1">({dates.length} days)</span>}
                        </p>
                        <div className="flex flex-col gap-0.5">
                          <p className="text-sm font-semibold text-black leading-tight">{data.employeeName || '—'}</p>
                          <span className="text-xs text-secondary-500">{data.employeeCode}</span>
                        </div>
                        {data.reason && (
                          <span className={`text-xs font-medium ${colors.text} ${colors.badge} px-2 py-0.5 rounded-full self-start`}>{data.reason}</span>
                        )}
                        <div className="flex flex-col gap-1.5 mt-1">
                          <span
                            className="text-sm font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full cursor-pointer hover:bg-purple-100 transition-colors self-start inline-flex items-center gap-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              const details = leaves
                                .filter((l) => l.employeeCode === empCode)
                                .filter((l) => {
                                  const r = l.reason?.toLowerCase() ?? 'other';
                                  const tk = r.includes('sick') || r.includes('medical') ? 'sick' :
                                          r.includes('casual') || r.includes('personal') ? 'casual' :
                                          r.includes('holiday') || r.includes('festival') ? 'holiday' :
                                          r.includes('maternity') || r.includes('paternity') ? 'maternity' :
                                          r.includes('earned') || r.includes('privilege') ? 'earned' : 'other';
                                  return tk === typeKey;
                                })
                                .flatMap((l) => (l.dates ?? (l.fromDate ? [l.fromDate] : [])))
                                .filter((d) => new Date(d) >= thirtyDaysAgo)
                                .sort((a, b) => b.localeCompare(a));
                              setModalData({
                                employeeCode: empCode,
                                employeeName: data.employeeName || '',
                                type: 'type',
                                typeKey,
                                details: details.map((d) => {
                                  const leave = leaves.find((l) => {
                                    const dates = l.dates ?? (l.fromDate ? [l.fromDate] : []);
                                    return dates.includes(d) && l.employeeCode === empCode;
                                  });
                                  const reason = leave?.reason?.toLowerCase() ?? 'other';
                                  const tk = reason.includes('sick') || reason.includes('medical') ? 'sick' :
                                          reason.includes('casual') || reason.includes('personal') ? 'casual' :
                                          reason.includes('holiday') || reason.includes('festival') ? 'holiday' :
                                          reason.includes('maternity') || reason.includes('paternity') ? 'maternity' :
                                          reason.includes('earned') || reason.includes('privilege') ? 'earned' : 'other';
                                  return { date: d, type: 'leave', leaveType: tk.charAt(0).toUpperCase() + tk.slice(1) };
                                }),
                              });
                              setModalOpen(true);
                            }}
                          >
                            <Palmtree size={12} /><strong>{typeCount}</strong> {typeKey} in last 30 days
                          </span>
                          <span
                            className="text-sm font-medium text-pink-600 bg-pink-50 px-2 py-0.5 rounded-full cursor-pointer hover:bg-pink-100 transition-colors self-start inline-flex items-center gap-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              const leaveDetails = leaves
                                .filter((l) => l.employeeCode === empCode)
                                .flatMap((l) => (l.dates ?? (l.fromDate ? [l.fromDate] : [])))
                                .filter((d) => new Date(d) >= thirtyDaysAgo)
                                .map((d) => {
                                  const leave = leaves.find((l) => {
                                    const dates = l.dates ?? (l.fromDate ? [l.fromDate] : []);
                                    return dates.includes(d) && l.employeeCode === empCode;
                                  });
                                  const reason = leave?.reason?.toLowerCase() ?? 'other';
                                  const tk = reason.includes('sick') || reason.includes('medical') ? 'sick' :
                                          reason.includes('casual') || reason.includes('personal') ? 'casual' :
                                          reason.includes('holiday') || reason.includes('festival') ? 'holiday' :
                                          reason.includes('maternity') || reason.includes('paternity') ? 'maternity' :
                                          reason.includes('earned') || reason.includes('privilege') ? 'earned' : 'other';
                                  return { date: d, type: 'leave', leaveType: tk.charAt(0).toUpperCase() + tk.slice(1) };
                                });
                              const wo = weekOffs.find((w) => w.employeeCode === empCode);
                              const woDays = wo?.days ?? [];
                              const woDetails: { date: string; type: string }[] = [];
                              for (let i = 0; i < 30; i++) {
                                const d = new Date();
                                d.setDate(d.getDate() - i);
                                const dayName = ALL_DAYS[d.getDay()];
                                if (woDays.includes(dayName)) {
                                  woDetails.push({ date: d.toISOString().split('T')[0], type: 'weekoff' });
                                }
                              }
                              const allDetails = [...leaveDetails, ...woDetails].sort((a, b) => b.date.localeCompare(a.date));
                              setModalData({
                                employeeCode: empCode,
                                employeeName: data.employeeName || '',
                                type: 'total',
                                details: allDetails,
                              });
                              setModalOpen(true);
                            }}
                          >
                            <TrendingDown size={12} /><strong>{totalCount}</strong> total days off in last 30 days
                          </span>
                        </div>
                    </div>
                  </div>
                </div>
              );
            } else {
              const empCode = data.employeeCode ?? '';
              const totalCount = totalDaysByEmployee.get(empCode) ?? 0;
              return (
                <div key={record.data.id} className="bg-white border border-purple-700 rounded-xl overflow-hidden cursor-pointer shadow-[0_2px_8px_rgba(126,34,206,0.15)] hover:shadow-[0_4px_16px_rgba(126,34,206,0.35)] transition-shadow w-[300px] h-[200px] shrink-0" onClick={() => {
                          const leaveDetails = leaves
                            .filter((l) => l.employeeCode === empCode)
                            .flatMap((l) => (l.dates ?? (l.fromDate ? [l.fromDate] : [])))
                            .filter((d) => new Date(d) >= thirtyDaysAgo)
                            .map((d) => ({ date: d, type: 'leave' }));
                          const wo = weekOffs.find((w) => w.employeeCode === empCode);
                          const woDays = wo?.days ?? [];
                          const woDetails: { date: string; type: string }[] = [];
                          for (let i = 0; i < 30; i++) {
                            const d = new Date();
                            d.setDate(d.getDate() - i);
                            const dayName = ALL_DAYS[d.getDay()];
                            if (woDays.includes(dayName)) {
                              woDetails.push({ date: d.toISOString().split('T')[0], type: 'weekoff' });
                            }
                          }
                          const allDetails = [...leaveDetails, ...woDetails].sort((a, b) => b.date.localeCompare(a.date));
                          setModalData({
                            employeeCode: empCode,
                            employeeName: data.employeeName || '',
                            type: 'total',
                            details: allDetails,
                          });
                          setModalOpen(true);
                        }}>
                  <div className="p-3 h-full">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex flex-col gap-0.5 mb-2">
                          <p className="text-sm font-semibold text-blue-700 leading-tight">{data.employeeName || '—'}</p>
                          <span className="text-xs text-secondary-500">{data.employeeCode}</span>
                        </div>
                        <p className="text-xs font-semibold text-secondary-700 mb-2">Week Off Days</p>
                        <div className="flex flex-wrap gap-1.5">
                          {ALL_DAYS.map((day) => {
                            const isOff = data.days?.includes(day);
                            return (
                              <span
                                key={day}
                                className={`text-xs px-2 py-1 rounded-full font-medium ${isOff ? 'bg-blue-600 text-white' : 'bg-white text-secondary-400 border border-secondary-200'}`}
                              >
                                {day.slice(0, 3)}
                              </span>
                            );
                          })}
                        </div>
                        <span
                          className="text-sm font-medium text-pink-600 bg-pink-50 px-2 py-0.5 rounded-full mt-2 inline-block cursor-pointer hover:bg-pink-100 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <strong>{totalCount}</strong> total days off in last 30 days
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }
          })
        )}
      </div>

      {/* Modal for details */}
      {modalOpen && modalData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-xl max-w-md w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-secondary-200">
              <div>
                <h2 className="text-base font-semibold text-secondary-900">{modalData.employeeName}</h2>
                <p className="text-xs text-secondary-500">{modalData.employeeCode}</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors">
                <X size={18} className="text-secondary-500" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {modalData.type === 'type' ? (
                <span className="text-sm font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full mb-3 inline-block">
                  {modalData.typeKey ? modalData.typeKey.charAt(0).toUpperCase() + modalData.typeKey.slice(1) : 'Other'} leaves in last 30 days
                </span>
              ) : (
                <span className="text-sm font-medium text-pink-600 bg-pink-50 px-2 py-0.5 rounded-full mb-3 inline-block">
                  Total days off in last 30 days
                </span>
              )}
              <div className="space-y-2">
                {modalData.details.map((detail, idx) => {
                  if (detail.type === 'leave') {
                    const leaveType = (detail as any).leaveType?.toLowerCase() || 'other';
                    const colors = getLeaveColor(leaveType);
                    return (
                      <div key={idx} className="flex items-center justify-between px-3 py-2 bg-secondary-50 rounded-lg">
                        <span className="text-sm text-secondary-800">{formatDate(detail.date)}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors.badge} ${colors.text}`}>
                          {(detail as any).leaveType || 'Leave'}
                        </span>
                      </div>
                    );
                  }
                  return (
                    <div key={idx} className="flex items-center justify-between px-3 py-2 bg-secondary-50 rounded-lg">
                      <span className="text-sm text-secondary-800">{formatDate(detail.date)}</span>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        Week Off
                      </span>
                    </div>
                  );
                })}
                {modalData.details.length === 0 && (
                  <p className="text-sm text-secondary-500 text-center py-4">No records found</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal for unauthorized absences */}
      {unauthorizedModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setUnauthorizedModalOpen(false)}>
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-secondary-200">
              <div>
                <h2 className="text-base font-semibold text-secondary-900">Unauthorized Absences</h2>
                <p className="text-xs text-secondary-500">May 12 — Jun 10, 2026 (30 days)</p>
              </div>
              <button onClick={() => setUnauthorizedModalOpen(false)} className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors">
                <X size={18} className="text-secondary-500" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {unauthorizedResults.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                    <AlertTriangle size={20} className="text-green-600" />
                  </div>
                  <p className="text-sm font-medium text-secondary-700">No unauthorized absences found</p>
                  <p className="text-xs text-secondary-500 mt-1">All scheduled workdays have clock-in and clock-out records</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {unauthorizedResults.map((result, idx) => (
                    <div key={idx} className="flex items-start justify-between px-3 py-2 bg-white rounded-lg border border-red-100">
                      <div>
                        <p className="text-sm font-medium text-secondary-900">{result.employeeName}</p>
                        <p className="text-xs text-secondary-500">{result.employeeCode}</p>
                        <p className="text-sm text-red-600 mt-0.5">{formatDate(result.date)} {result.isNightShift && '(night shift)'}</p>
                      </div>
                      <div className="flex flex-col gap-1 items-end">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-secondary-200 text-secondary-700">
                          {result.shiftStart} — {result.shiftEnd}
                        </span>
                        <div className="flex gap-1">
                          {result.missingIn && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">Missing IN</span>
                          )}
                          {result.missingOut && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">Missing OUT</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bulk Add Leaves Modal */}
      {bulkLeaveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-secondary-200">
              <h2 className="text-lg font-semibold text-secondary-900">Add Leaves</h2>
              <button onClick={closeBulkLeaveModal} className="p-1.5 rounded-lg text-secondary-500 hover:text-secondary-900 hover:bg-secondary-100 transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleBulkLeaveSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
              <p className="text-sm text-secondary-600">Select employees and choose leave dates to add leave for all selected employees at once.</p>

              {/* Employee selector */}
              <div className="border border-secondary-300 rounded-lg p-3">
                <label className="block text-sm font-medium text-secondary-700 mb-2">Select Employees ({bulkLeaveSelectedIds.size} selected)</label>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-400" />
                  <input type="text" placeholder="Search by name or code..."
                    value={bulkLeaveSearchQuery} onChange={(e) => setBulkLeaveSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1 border border-secondary-200 rounded-lg p-2">
                  {employees.filter((emp) => {
                    const s = bulkLeaveSearchQuery.toLowerCase();
                    return emp.employeeName?.toLowerCase().includes(s) || emp.employeeCode?.toLowerCase().includes(s);
                  }).map((emp) => (
                    <label key={emp.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary-50 cursor-pointer">
                      <input type="checkbox" checked={bulkLeaveSelectedIds.has(emp.id)} onChange={() => toggleBulkLeaveEmployee(emp.id)}
                        className="w-4 h-4 text-purple-600 rounded border-secondary-300 focus:ring-purple-500" />
                      <div>
                        <p className="text-sm font-medium text-purple-700">{emp.employeeName || 'Unnamed'}</p>
                        <p className="text-xs text-secondary-500">{emp.employeeCode || '—'}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Calendar */}
              <div className="border border-secondary-300 rounded-lg p-3">
                <label className="block text-sm font-medium text-secondary-700 mb-2">Select Leave Dates ({bulkLeaveSelectedDates.length} selected)</label>
                {(() => {
                  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                  const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa'];
                  const firstDay = new Date(bulkLeaveCalendarYear, bulkLeaveCalendarMonth, 1).getDay();
                  const daysInMonth = new Date(bulkLeaveCalendarYear, bulkLeaveCalendarMonth + 1, 0).getDate();
                  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({length: daysInMonth}, (_, i) => i + 1)];
                  while (cells.length % 7 !== 0) cells.push(null);
                  return (
                    <div className="border border-secondary-200 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-purple-50">
                        <button type="button" onClick={() => { if (bulkLeaveCalendarMonth === 0) { setBulkLeaveCalendarMonth(11); setBulkLeaveCalendarYear(y => y - 1); } else setBulkLeaveCalendarMonth(m => m - 1); }} className="p-1 rounded hover:bg-purple-100 text-purple-700"><ChevronLeft size={14}/></button>
                        <span className="text-sm font-semibold text-secondary-800">{MONTHS[bulkLeaveCalendarMonth]} {bulkLeaveCalendarYear}</span>
                        <button type="button" onClick={() => { if (bulkLeaveCalendarMonth === 11) { setBulkLeaveCalendarMonth(0); setBulkLeaveCalendarYear(y => y + 1); } else setBulkLeaveCalendarMonth(m => m + 1); }} className="p-1 rounded hover:bg-purple-100 text-purple-700"><ChevronRight size={14}/></button>
                      </div>
                      <div className="grid grid-cols-7 border-b border-secondary-100">
                        {DAYS.map(d => <div key={d} className="text-center text-xs font-medium text-secondary-500 py-1">{d}</div>)}
                      </div>
                      <div className="grid grid-cols-7 p-1 gap-0.5">
                        {cells.map((day, i) => {
                          if (!day) return <div key={i} />;
                          const dateStr = `${bulkLeaveCalendarYear}-${String(bulkLeaveCalendarMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                          const selected = bulkLeaveSelectedDates.includes(dateStr);
                          return (
                            <button key={i} type="button"
                              onClick={() => setBulkLeaveSelectedDates(prev => selected ? prev.filter(d => d !== dateStr) : [...prev, dateStr])}
                              className={`w-full aspect-square flex items-center justify-center text-xs rounded-full transition-colors ${
                                selected ? 'bg-purple-600 text-white font-semibold' : 'hover:bg-purple-100 text-secondary-800'
                              }`}>{day}</button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Leave type */}
              <div className="border border-secondary-300 rounded-lg p-3">
                <label className="block text-sm font-medium text-secondary-700 mb-2">Leave Type</label>
                <select value={bulkLeaveForm.reason} onChange={(e) => setBulkLeaveForm({ reason: e.target.value })}
                  className="w-full px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" required>
                  <option value="">Select leave type...</option>
                  <option value="Casual Leave">Casual Leave</option>
                  <option value="Earned Leave">Earned Leave</option>
                  <option value="Holiday Off">Holiday Off</option>
                  <option value="Overtime Off">Overtime Off</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeBulkLeaveModal}
                  className="flex-1 py-2.5 text-sm font-medium text-secondary-700 border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors">Cancel</button>
                <button type="submit" disabled={isSavingBulkLeave || bulkLeaveSelectedIds.size === 0 || bulkLeaveSelectedDates.length === 0}
                  className="flex-1 py-2.5 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-60">
                  {isSavingBulkLeave ? 'Saving...' : `Add Leave for ${bulkLeaveSelectedIds.size} Employee${bulkLeaveSelectedIds.size !== 1 ? 's' : ''}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
