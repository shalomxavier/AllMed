import React, { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw, Umbrella, Search, X, AlertTriangle, ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getFirestore, collection, getDocs, query, orderBy, where, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useAuthContext } from '@/contexts/AuthContext';
import { RedSpinner } from '@/components/common';

interface LeaveRecord {
  id: string;
  type?: 'leave' | 'weekoff';
  employeeCode?: string;
  employeeName?: string;
  dates?: string[];
  days?: string[];
  fromDate?: string;
  toDate?: string;
  reason?: string;
  createdAt?: any;
}

type WeekOffRecord = LeaveRecord;

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

const getLatestLeaveDate = (r: LeaveRecord): string => {
  if (r.toDate) return r.toDate;
  if (r.fromDate) return r.fromDate;
  if (r.dates && r.dates.length > 0) return [...r.dates].sort().pop() ?? '';
  return '';
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
  const { currentUser, userData } = useAuthContext();
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [weekOffs, setWeekOffs] = useState<WeekOffRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDateFilter, setFromDateFilter] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1).toLocaleDateString('en-CA');
  });
  const [toDateFilter, setToDateFilter] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth() + 1, 0).toLocaleDateString('en-CA');
  });
  const [typeFilter, setTypeFilter] = useState<'all' | 'leave' | 'weekoff' | 'sick' | 'casual' | 'holiday' | 'maternity' | 'earned'>('all');
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

  const [editLeaveOpen, setEditLeaveOpen] = useState(false);
  const [editingLeave, setEditingLeave] = useState<LeaveRecord | null>(null);
  const [editLeaveForm, setEditLeaveForm] = useState({ reason: '', dates: [] as string[] });
  const [editCalMonth, setEditCalMonth] = useState(new Date().getMonth());
  const [editCalYear, setEditCalYear] = useState(new Date().getFullYear());
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingLeave, setDeletingLeave] = useState<LeaveRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [branchesList, setBranchesList] = useState<{ id: string; name: string; employeeIds: string[] }[]>([]);
  const [branchFilter, setBranchFilter] = useState('');
  const [managerBranch, setManagerBranch] = useState<string | null>(null);

  const fetchData = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const db = getFirestore();
      const [leavesSnap, employeesSnap, branchesSnap] = await Promise.all([
        getDocs(query(collection(db, 'leaves'), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'employees'), orderBy('employeeName'))),
        getDocs(query(collection(db, 'branches'))),
      ]);
      const allLeavesData: LeaveRecord[] = [];
      leavesSnap.forEach((d) => allLeavesData.push({ id: d.id, ...d.data() }));
      const leavesData = allLeavesData.filter(r => r.type !== 'weekoff');
      const weekOffsData = allLeavesData.filter(r => r.type === 'weekoff');
      const employeesData: any[] = [];
      employeesSnap.forEach((d) => employeesData.push({ id: d.id, ...d.data() }));
      const filteredEmployees = employeesData.filter((e) => !e.employeeCodeInDevice?.startsWith('Del'));

      // Build branchesList
      const branchesData: { id: string; name: string; employeeIds: string[] }[] = [];
      branchesSnap.forEach((d) => {
        branchesData.push({ id: d.id, name: d.data().name || '', employeeIds: d.data().employeeIds || [] });
      });
      setBranchesList(branchesData);

      // Set manager branch if user is a branch manager
      if (userData?.designation === 'Branch Manager' && currentUser) {
        try {
          const branchQuery = query(collection(db, 'branches'), where('managerId', '==', currentUser.uid));
          const branchSnapshot = await getDocs(branchQuery);
          const branchName = branchSnapshot.empty ? '' : (branchSnapshot.docs[0].data().name || '');
          setManagerBranch(branchName);
          setBranchFilter(branchName);
        } catch (err) {
          console.error('Error resolving manager branch:', err);
          setManagerBranch('');
        }
      }

      setLeaves(leavesData);
      setWeekOffs(weekOffsData);
      setEmployees(filteredEmployees);
    } catch (e) {
      console.error('Error fetching data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (currentUser) fetchData(); }, [currentUser]);

  const openEditLeave = (leave: LeaveRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingLeave(leave);
    const dates = leave.dates ?? (leave.fromDate ? [leave.fromDate] : []);
    setEditLeaveForm({ reason: leave.reason ?? '', dates });
    if (dates.length > 0) {
      const d = new Date(dates[0]);
      setEditCalMonth(d.getMonth());
      setEditCalYear(d.getFullYear());
    }
    setEditLeaveOpen(true);
  };

  const handleEditLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLeave || editLeaveForm.dates.length === 0) return;
    setIsSavingEdit(true);
    try {
      const db = getFirestore();
      const sorted = [...editLeaveForm.dates].sort();
      await updateDoc(doc(db, 'leaves', editingLeave.id), {
        dates: sorted,
        fromDate: sorted[0],
        toDate: sorted[sorted.length - 1],
        reason: editLeaveForm.reason,
      });
      setEditLeaveOpen(false);
      setEditingLeave(null);
      fetchData();
    } catch (err) { console.error(err); }
    finally { setIsSavingEdit(false); }
  };

  const handleDeleteLeave = (leave: LeaveRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingLeave(leave);
    setDeleteModalOpen(true);
  };

  const confirmDeleteLeave = async () => {
    if (!deletingLeave) return;
    setIsDeleting(true);
    try {
      const db = getFirestore();
      await deleteDoc(doc(db, 'leaves', deletingLeave.id));
      fetchData();
      setDeleteModalOpen(false);
      setDeletingLeave(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsDeleting(false);
    }
  };

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
        for (const date of sorted) {
          await addDoc(collection(db, 'leaves'), {
            type: 'leave',
            employeeId: employee.id,
            employeeCode: employee.employeeCode,
            employeeName: employee.employeeName,
            dates: [date],
            fromDate: date,
            toDate: date,
            reason: bulkLeaveForm.reason,
            createdAt: serverTimestamp(),
            createdBy: currentUser?.uid,
          });
        }
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
      const PERIOD_END = new Date();
      const PERIOD_START = new Date();
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

      // Fetch all leaves (type=leave only, not weekoff)
      const leavesSnap = await getDocs(collection(db, 'leaves'));
      const leavesData: LeaveRecord[] = [];
      leavesSnap.forEach((d) => { const rec = { id: d.id, ...d.data() } as LeaveRecord; if (rec.type !== 'weekoff') leavesData.push(rec); });

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

          // Skip week-offs (from unified leaves collection with type=weekoff)
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

  // Flatten all records into a single list and sort by latest date descending
  const allRecords: Array<{ type: 'leave' | 'weekoff'; data: LeaveRecord }> = [
    ...leaves.map((l) => ({ type: 'leave' as const, data: l })),
    ...weekOffs.map((w) => ({ type: 'weekoff' as const, data: w })),
  ].sort((a, b) => getLatestLeaveDate(b.data).localeCompare(getLatestLeaveDate(a.data)));

  const filtered = allRecords.filter((r) => {
    const data = r.data as any;
    const name = data.employeeName?.toLowerCase() ?? '';
    const code = data.employeeCode?.toLowerCase() ?? '';
    const matchesSearch = name.includes(searchQuery.toLowerCase()) || code.includes(searchQuery.toLowerCase());

    // Branch filter (branches collection is the source of truth)
    if (branchFilter) {
      const branchData = branchesList.find((b) => b.name === branchFilter);
      const branchEmployeeIds = branchData?.employeeIds || [];
      const employee = employees.find((e) => e.employeeCode === data.employeeCode);
      if (!employee || !branchEmployeeIds.includes(employee.id)) return false;
    }

    // Type filter
    if (typeFilter === 'weekoff' && r.type !== 'weekoff') return false;
    if (typeFilter === 'leave' && r.type !== 'leave') return false;
    if (typeFilter !== 'all' && typeFilter !== 'leave' && typeFilter !== 'weekoff' && r.type === 'weekoff') return false;
    if (r.type === 'leave' && typeFilter !== 'all' && typeFilter !== 'leave') {
      const reason = data.reason?.toLowerCase() ?? '';
      if (typeFilter === 'sick' && !(reason.includes('sick') || reason.includes('medical'))) return false;
      if (typeFilter === 'casual' && !(reason.includes('casual') || reason.includes('personal'))) return false;
      if (typeFilter === 'holiday' && !(reason.includes('holiday') || reason.includes('festival'))) return false;
      if (typeFilter === 'maternity' && !(reason.includes('maternity') || reason.includes('paternity'))) return false;
      if (typeFilter === 'earned' && !(reason.includes('earned') || reason.includes('privilege'))) return false;
    }

    const dates = data.dates ?? [];
    if (dates.length > 0) {
      return matchesSearch && dates.some((d: string) => d >= fromDateFilter && d <= toDateFilter);
    }

    const from = data.fromDate;
    const to = data.toDate || from;
    if (from && to) {
      return matchesSearch && from <= toDateFilter && to >= fromDateFilter;
    }

    return matchesSearch;
  });

  const employeeGroups = Array.from(
    filtered.reduce((map, record) => {
      const empCode = (record.data as any).employeeCode ?? '';
      if (!map.has(empCode)) {
        map.set(empCode, { employeeCode: empCode, employeeName: (record.data as any).employeeName || '', records: [] });
      }
      map.get(empCode)!.records.push(record);
      return map;
    }, new Map<string, { employeeCode: string; employeeName: string; records: typeof filtered }>())
      .values()
  ).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => navigate('/attendance')} className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors">
          <ArrowLeft size={20} className="text-secondary-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-semibold text-secondary-900">Week Off / Leave</h1>
          <p className="text-xs text-secondary-500">All employee leaves and week-off schedules</p>
        </div>
        <button onClick={fetchData} className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors">
          {loading ? <RedSpinner size="sm" /> : <RefreshCw size={18} className="text-secondary-500" />}
        </button>
      </div>

      {/* Search & Date Filter */}
      <div className="px-4 pt-3 pb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex-1 relative min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400" />
            <input
              type="text"
              placeholder="Search by name or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-secondary-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-300"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={fromDateFilter}
              onChange={(e) => setFromDateFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-secondary-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-300"
            />
            <span className="text-sm text-secondary-500">→</span>
            <input
              type="date"
              value={toDateFilter}
              onChange={(e) => setToDateFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-secondary-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-300"
            />
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-secondary-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-300"
              disabled={userData?.designation === 'Branch Manager'}
            >
              {userData?.designation === 'Branch Manager' ? (
                <option value={managerBranch ?? ''}>{managerBranch || 'No branch assigned'}</option>
              ) : (
                <>
                  <option value="">All Branches</option>
                  {branchesList.map((branch) => (
                    <option key={branch.id} value={branch.name}>
                      {branch.name}
                    </option>
                  ))}
                </>
              )}
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="px-3 py-2 text-sm border border-secondary-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-300"
            >
              <option value="all">All Types</option>
              <option value="leave">All Leaves</option>
              <option value="weekoff">Week Off</option>
              <option value="sick">Sick Leave</option>
              <option value="casual">Casual Leave</option>
              <option value="holiday">Holiday</option>
              <option value="maternity">Maternity/Paternity</option>
              <option value="earned">Earned Leave</option>
            </select>
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <button onClick={() => setBulkLeaveModalOpen(true)} className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors shrink-0">
              <Umbrella size={16} />
              Add Leaves
            </button>
            <button onClick={checkUnauthorizedAbsences} disabled={checkingAbsences} className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors shrink-0 disabled:opacity-70">
              {checkingAbsences ? <RedSpinner size="sm" /> : <AlertTriangle size={16} />}
              Check Unauthorized Absence
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3 content-start">
        {loading ? (
          <div className="w-full flex items-center justify-center py-16">
            <RedSpinner />
          </div>
        ) : filtered.length === 0 ? (
          <div className="w-full flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mb-3">
              <Umbrella className="w-8 h-8 text-purple-400" />
            </div>
            <p className="text-sm font-medium text-secondary-700">No records found</p>
          </div>
        ) : (
          employeeGroups.map((group) => {
            const weekOffRecord = group.records.find((r) => r.type === 'weekoff')?.data as LeaveRecord | undefined;
            const leaveRecords = group.records.filter((r) => r.type === 'leave').map((r) => r.data as LeaveRecord);
            const allLeaveDates = leaveRecords.flatMap((l) => l.dates ?? (l.fromDate ? [l.fromDate] : [])).sort((a, b) => a.localeCompare(b));
            const uniqueLeaveDates = Array.from(new Set(allLeaveDates));
            const empCode = group.employeeCode;

            return (
              <div key={empCode} className="bg-white/80 backdrop-blur-sm rounded-xl overflow-hidden cursor-pointer shadow-lg hover:shadow-xl transition-shadow h-auto min-h-[200px]" onClick={() => {
                const leaveDetails = leaves
                  .filter((l) => l.employeeCode === empCode)
                  .flatMap((l) => (l.dates ?? (l.fromDate ? [l.fromDate] : [])))
                  .filter((d) => new Date(d) >= thirtyDaysAgo)
                  .map((d) => {
                    const leave = leaves.find((l) => {
                      const dates = l.dates ?? (l.fromDate ? [l.fromDate] : []);
                      return dates.includes(d) && l.employeeCode === empCode;
                    });
                    return { date: d, type: 'leave', leaveType: leave?.reason || 'Leave' };
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
                  employeeName: group.employeeName || '',
                  type: 'total',
                  details: allDetails,
                });
                setModalOpen(true);
              }}>
                <div className="p-3 h-full">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-sm font-semibold text-black leading-tight flex-1 min-w-0">{group.employeeName || '—'}</p>
                    </div>
                    <span className="text-xs text-secondary-500">{empCode}</span>
                    {weekOffRecord && (
                      <div className="flex flex-wrap gap-1.5">
                        {ALL_DAYS.map((day) => {
                          const isOff = weekOffRecord.days?.includes(day);
                          return (
                            <span key={day} className={`text-xs px-2 py-0.5 rounded-full font-medium ${isOff ? 'bg-blue-600 text-white' : 'bg-white text-secondary-400 border border-secondary-200'}`}>
                              {day.slice(0, 3)}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {uniqueLeaveDates.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {uniqueLeaveDates.slice(0, 5).map((date) => {
                          const leave = leaves.find((l) => {
                            const dates = l.dates ?? (l.fromDate ? [l.fromDate] : []);
                            return l.employeeCode === empCode && dates.includes(date);
                          });
                          const reason = leave?.reason || 'Leave';
                          const colors = getLeaveColor(reason);
                          return (
                            <span key={date} className={`text-sm font-medium ${colors.text} ${colors.badge} px-2 py-0.5 rounded-full inline-flex items-center gap-1.5`}>
                              <span>{formatDate(date)}</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>{reason}</span>
                            </span>
                          );
                        })}
                        {uniqueLeaveDates.length > 5 && (
                          <span className="text-sm font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
                            +{uniqueLeaveDates.length - 5} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
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
              <div className="space-y-2">
                {modalData.details.map((detail, idx) => {
                  if (detail.type === 'leave') {
                    const leaveType = (detail as any).leaveType?.toLowerCase() || 'other';
                    const colors = getLeaveColor(leaveType);
                    const matchingLeave = leaves.find((l) => {
                      const dates = l.dates ?? (l.fromDate ? [l.fromDate] : []);
                      return l.employeeCode === modalData.employeeCode && dates.includes(detail.date);
                    });
                    return (
                      <div key={idx} className="flex items-center justify-between px-3 py-2 bg-secondary-50 rounded-lg">
                        <span className="text-sm text-secondary-800">{formatDate(detail.date)}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors.badge} ${colors.text}`}>
                            {(detail as any).leaveType || 'Leave'}
                          </span>
                          {matchingLeave && (
                            <div className="flex items-center gap-1">
                              <button type="button" onClick={(e) => openEditLeave(matchingLeave, e)} className="p-1 rounded hover:bg-secondary-200 text-secondary-600">
                                <Pencil size={14} />
                              </button>
                              <button type="button" onClick={(e) => handleDeleteLeave(matchingLeave, e)} className="p-1 rounded hover:bg-red-100 text-red-600">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </div>
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
                    const matchesSearch = emp.employeeName?.toLowerCase().includes(s) || emp.employeeCode?.toLowerCase().includes(s);

                    // Branch filter using branches collection as source of truth.
                    // Branch Managers are locked to their own branch; others follow the selected branch filter (if any).
                    const effectiveBranch = userData?.designation === 'Branch Manager' ? managerBranch : branchFilter;
                    if (effectiveBranch) {
                      const branchData = branchesList.find((b) => b.name === effectiveBranch);
                      const branchEmployeeIds = branchData?.employeeIds || [];
                      return matchesSearch && branchEmployeeIds.includes(emp.id);
                    }

                    return matchesSearch;
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
                  <option value="Week Off">Week Off</option>
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

      {/* Edit Leave Modal */}
      {editLeaveOpen && editingLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-secondary-200">
              <div>
                <h2 className="text-base font-semibold text-secondary-900">Edit Leave</h2>
                <p className="text-xs text-secondary-500 mt-0.5">{editingLeave.employeeName} · {editingLeave.employeeCode}</p>
              </div>
              <button onClick={() => setEditLeaveOpen(false)} className="p-1.5 rounded-lg text-secondary-500 hover:text-secondary-900 hover:bg-secondary-100 transition-colors"><X size={20} /></button>
            </div>
            <form onSubmit={handleEditLeaveSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Calendar */}
              <div className="border border-secondary-300 rounded-lg p-3">
                <label className="block text-sm font-medium text-secondary-700 mb-2">Leave Dates ({editLeaveForm.dates.length} selected)</label>
                {(() => {
                  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                  const DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa'];
                  const firstDay = new Date(editCalYear, editCalMonth, 1).getDay();
                  const daysInMonth = new Date(editCalYear, editCalMonth + 1, 0).getDate();
                  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({length: daysInMonth}, (_, i) => i + 1)];
                  while (cells.length % 7 !== 0) cells.push(null);
                  return (
                    <div className="border border-secondary-200 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-purple-50">
                        <button type="button" onClick={() => { if (editCalMonth === 0) { setEditCalMonth(11); setEditCalYear(y => y - 1); } else setEditCalMonth(m => m - 1); }} className="p-1 rounded hover:bg-purple-100 text-purple-700"><ChevronLeft size={14}/></button>
                        <span className="text-sm font-semibold text-secondary-800">{MONTHS[editCalMonth]} {editCalYear}</span>
                        <button type="button" onClick={() => { if (editCalMonth === 11) { setEditCalMonth(0); setEditCalYear(y => y + 1); } else setEditCalMonth(m => m + 1); }} className="p-1 rounded hover:bg-purple-100 text-purple-700"><ChevronRight size={14}/></button>
                      </div>
                      <div className="grid grid-cols-7 border-b border-secondary-100">
                        {DAYS.map(d => <div key={d} className="text-center text-xs font-medium text-secondary-500 py-1">{d}</div>)}
                      </div>
                      <div className="grid grid-cols-7 p-1 gap-0.5">
                        {cells.map((day, i) => {
                          if (!day) return <div key={i} />;
                          const dateStr = `${editCalYear}-${String(editCalMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                          const selected = editLeaveForm.dates.includes(dateStr);
                          return (
                            <button key={i} type="button"
                              onClick={() => setEditLeaveForm(f => ({ ...f, dates: selected ? f.dates.filter(d => d !== dateStr) : [...f.dates, dateStr] }))}
                              className={`w-full aspect-square flex items-center justify-center text-xs rounded-full transition-colors ${selected ? 'bg-purple-600 text-white font-semibold' : 'hover:bg-purple-100 text-secondary-800'}`}>{day}</button>
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
                <select value={editLeaveForm.reason} onChange={(e) => setEditLeaveForm(f => ({ ...f, reason: e.target.value }))}
                  className="w-full px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" required>
                  <option value="">Select leave type...</option>
                  <option value="Week Off">Week Off</option>
                  <option value="Casual Leave">Casual Leave</option>
                  <option value="Earned Leave">Earned Leave</option>
                  <option value="Holiday Off">Holiday Off</option>
                  <option value="Overtime Off">Overtime Off</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditLeaveOpen(false)}
                  className="flex-1 py-2.5 text-sm font-medium text-secondary-700 border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors">Cancel</button>
                <button type="submit" disabled={isSavingEdit || editLeaveForm.dates.length === 0 || !editLeaveForm.reason}
                  className="flex-1 py-2.5 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-60">
                  {isSavingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && deletingLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <Trash2 size={20} className="text-red-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-secondary-900">Delete Leave</h2>
                  <p className="text-xs text-secondary-500">{deletingLeave.employeeName} · {deletingLeave.employeeCode}</p>
                </div>
              </div>
              <p className="text-sm text-secondary-700 mb-6">
                Are you sure you want to delete this leave record? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteModalOpen(false)}
                  className="flex-1 py-2.5 text-sm font-medium text-secondary-700 border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteLeave}
                  disabled={isDeleting}
                  className="flex-1 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60"
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
