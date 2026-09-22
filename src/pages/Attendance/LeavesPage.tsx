import React, { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw, Umbrella, Search, X, AlertTriangle, ChevronLeft, ChevronRight, Pencil, Trash2, BarChart3, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getFirestore, collection, getDocs, query, orderBy, where, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useAuthContext } from '@/contexts/AuthContext';
import { RedSpinner } from '@/components/common';
import {
  flattenShiftAssignments,
  normalizeEmployeeCode,
  resolveShiftAssignment,
  type ShiftSlotDocument,
} from '@/utils/shiftAssignments';
import { LeaveAvailabilitySummary } from '@/components/attendance/LeaveAvailabilitySummary';
import {
  formatLeaveLimitFailures,
  getLeaveAvailabilitySummaries,
  validateLeaveAssignments,
  type LeaveLimitRecord,
  type ProposedLeaveAssignment,
} from '@/utils/leaveLimits';

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
  duration?: 'full_day' | 'half_day';
  halfDayPeriod?: 'first_half' | 'second_half';
  dayValue?: number;
  createdAt?: any;
}

type WeekOffRecord = LeaveRecord;

type ViewMode = 'calendar' | 'cards';

interface CalendarEntry {
  key: string;
  date: string;
  employeeCode: string;
  employeeName: string;
  type: 'leave' | 'weekoff';
  reason: string;
  duration?: 'full_day' | 'half_day';
  halfDayPeriod?: 'first_half' | 'second_half';
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

const getDateRange = (fromDate: string, toDate: string): string[] => {
  const dates: string[] = [];
  const [startYear, startMonth, startDay] = fromDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = toDate.split('-').map(Number);
  const current = new Date(Date.UTC(startYear, startMonth - 1, startDay));
  const end = new Date(Date.UTC(endYear, endMonth - 1, endDay));
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
};

const getMonthRange = (year: number, month: number) => ({
  from: `${year}-${String(month + 1).padStart(2, '0')}-01`,
  to: `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`,
});

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

const getIstDayName = (date: Date): string =>
  date.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', weekday: 'long' });

const isFutureDate = (dateStr: string): boolean => {
  const today = getDateKey(new Date());
  return dateStr > today;
};

const getPunchMinutes = (logDate: any): number | null => {
  const d = toDate(logDate);
  if (!d) return null;
  const timeStr = d.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
};

const shiftRelativeMinutes = (punchMinutes: number, startMinutes: number): number => {
  if (punchMinutes >= startMinutes) return punchMinutes - startMinutes;
  return punchMinutes + 24 * 60 - startMinutes;
};

const addDaysIst = (dateStr: string, days: number): string => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return getDateKey(date);
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
  const canManageLeaves = userData?.designation === 'Director' || userData?.designation === 'HR' || userData?.designation === 'Branch Manager';
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
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState<{ employeeCode: string; employeeName: string; type: 'type' | 'total'; typeKey?: string; details: any[] } | null>(null);
  const [unauthorizedModalOpen, setUnauthorizedModalOpen] = useState(false);
  const [unauthorizedResults, setUnauthorizedResults] = useState<any[]>([]);
  const [unauthorizedPeriod, setUnauthorizedPeriod] = useState<{ start: string; end: string } | null>(null);
  const [checkingAbsences, setCheckingAbsences] = useState(false);
  const [bulkLeaveModalOpen, setBulkLeaveModalOpen] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [bulkLeaveSelectedIds, setBulkLeaveSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLeaveSearchQuery, setBulkLeaveSearchQuery] = useState('');
  const [bulkLeaveForm, setBulkLeaveForm] = useState<{ reason: string; duration: 'full_day' | 'half_day'; halfDayPeriod?: 'first_half' | 'second_half' }>({ reason: '', duration: 'full_day' });
  const [bulkLeaveSelectedDates, setBulkLeaveSelectedDates] = useState<string[]>([]);
  const [bulkLeaveCalendarMonth, setBulkLeaveCalendarMonth] = useState(new Date().getMonth());
  const [bulkLeaveCalendarYear, setBulkLeaveCalendarYear] = useState(new Date().getFullYear());
  const [isSavingBulkLeave, setIsSavingBulkLeave] = useState(false);

  const [editLeaveOpen, setEditLeaveOpen] = useState(false);
  const [editingLeave, setEditingLeave] = useState<LeaveRecord | null>(null);
  const [editLeaveForm, setEditLeaveForm] = useState<{ reason: string; dates: string[]; duration: 'full_day' | 'half_day'; halfDayPeriod?: 'first_half' | 'second_half' }>({ reason: '', dates: [], duration: 'full_day' });
  const [editCalMonth, setEditCalMonth] = useState(new Date().getMonth());
  const [editCalYear, setEditCalYear] = useState(new Date().getFullYear());
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingLeave, setDeletingLeave] = useState<LeaveRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [branchesList, setBranchesList] = useState<{ id: string; name: string; employeeIds: string[] }[]>([]);
  const [branchFilter, setBranchFilter] = useState('');
  const [managerBranch, setManagerBranch] = useState<string | null>(null);
  const [leaveLimits, setLeaveLimits] = useState<LeaveLimitRecord[]>([]);
  const [bulkLeaveLimitErrors, setBulkLeaveLimitErrors] = useState<string[]>([]);
  const [editLeaveLimitErrors, setEditLeaveLimitErrors] = useState<string[]>([]);

  const fetchData = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const db = getFirestore();
      const [leavesSnap, employeesSnap, branchesSnap, limitsSnap] = await Promise.all([
        getDocs(query(collection(db, 'leaves'), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'employees'), orderBy('employeeName'))),
        getDocs(query(collection(db, 'branches'))),
        getDocs(collection(db, 'leaveLimits')),
      ]);
      const allLeavesData: LeaveRecord[] = [];
      leavesSnap.forEach((d) => allLeavesData.push({ id: d.id, ...d.data() }));
      const leavesData = allLeavesData.filter(r => r.type !== 'weekoff');
      const weekOffsData = allLeavesData.filter(r => r.type === 'weekoff');
      const employeesData: any[] = [];
      employeesSnap.forEach((d) => employeesData.push({ id: d.id, ...d.data() }));
      const limitData: LeaveLimitRecord[] = [];
      limitsSnap.forEach((d) => limitData.push({ id: d.id, ...d.data() }));
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
      setLeaveLimits(limitData);
      setEmployees(filteredEmployees);
    } catch (e) {
      console.error('Error fetching data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (currentUser) fetchData(); }, [currentUser]);

  const fetchLeaveValidationData = async () => {
    const db = getFirestore();
    const [leavesSnap, limitsSnap] = await Promise.all([
      getDocs(collection(db, 'leaves')),
      getDocs(collection(db, 'leaveLimits')),
    ]);
    const latestLeaves: LeaveRecord[] = [];
    const latestLimits: LeaveLimitRecord[] = [];
    leavesSnap.forEach((d) => latestLeaves.push({ id: d.id, ...d.data() }));
    limitsSnap.forEach((d) => latestLimits.push({ id: d.id, ...d.data() }));
    return { latestLeaves, latestLimits };
  };

  const getStoredLeaves = () => [...leaves, ...weekOffs];

  const getBulkLeaveProposals = (
    selectedIds: Set<string>,
    selectedDates: string[],
    form = bulkLeaveForm,
  ): ProposedLeaveAssignment[] => {
    if (!form.reason) return [];
    return Array.from(selectedIds).flatMap((employeeId) => {
      const employee = employees.find((e) => e.id === employeeId);
      const employeeCode = employee?.employeeCode;
      if (!employeeCode) return [];
      return selectedDates.map((date) => ({
        employeeCode,
        employeeName: employee.employeeName,
        date,
        leaveType: form.reason,
        duration: form.duration,
      }));
    });
  };

  const validateBulkLeaveSelection = (
    selectedIds: Set<string>,
    selectedDates: string[],
    form = bulkLeaveForm,
  ): boolean => {
    const failures = validateLeaveAssignments(
      getBulkLeaveProposals(selectedIds, selectedDates, form),
      getStoredLeaves(),
      leaveLimits,
    );
    setBulkLeaveLimitErrors(formatLeaveLimitFailures(failures));
    return failures.length === 0;
  };

  const getEditLeaveProposals = (form = editLeaveForm): ProposedLeaveAssignment[] => {
    const employeeCode = editingLeave?.employeeCode;
    if (!employeeCode || !form.reason) return [];
    return form.dates.map((date) => ({
      employeeCode,
      employeeName: editingLeave.employeeName,
      date,
      leaveType: form.reason,
      duration: form.duration,
    }));
  };

  const validateEditLeaveSelection = (form = editLeaveForm): boolean => {
    const failures = validateLeaveAssignments(
      getEditLeaveProposals(form),
      getStoredLeaves(),
      leaveLimits,
      editingLeave?.id,
    );
    setEditLeaveLimitErrors(formatLeaveLimitFailures(failures));
    return failures.length === 0;
  };

  const bulkLeaveAvailability = getLeaveAvailabilitySummaries(
    getBulkLeaveProposals(bulkLeaveSelectedIds, bulkLeaveSelectedDates),
    getStoredLeaves(),
    leaveLimits,
  );
  const editLeaveAvailability = getLeaveAvailabilitySummaries(
    getEditLeaveProposals(),
    getStoredLeaves(),
    leaveLimits,
    editingLeave?.id,
  );

  const updateBulkLeaveForm = (form: typeof bulkLeaveForm) => {
    if (!validateBulkLeaveSelection(bulkLeaveSelectedIds, bulkLeaveSelectedDates, form)) return;
    setBulkLeaveForm(form);
  };

  const updateEditLeaveForm = (form: typeof editLeaveForm) => {
    if (!validateEditLeaveSelection(form)) return;
    setEditLeaveForm(form);
  };

  const openEditLeave = (leave: LeaveRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditLeaveLimitErrors([]);
    setEditingLeave(leave);
    const dates = leave.dates ?? (leave.fromDate ? [leave.fromDate] : []);
    setEditLeaveForm({ reason: leave.reason ?? '', dates, duration: leave.duration === 'half_day' ? 'half_day' : 'full_day', halfDayPeriod: leave.halfDayPeriod });
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
      const { latestLeaves, latestLimits } = await fetchLeaveValidationData();
      const failures = validateLeaveAssignments(
        getEditLeaveProposals(),
        latestLeaves,
        latestLimits,
        editingLeave.id,
      );
      if (failures.length > 0) {
        setEditLeaveLimitErrors(formatLeaveLimitFailures(failures));
        return;
      }

      const sorted = [...editLeaveForm.dates].sort();
      await updateDoc(doc(db, 'leaves', editingLeave.id), {
        dates: sorted,
        fromDate: sorted[0],
        toDate: sorted[sorted.length - 1],
        reason: editLeaveForm.reason,
        duration: editLeaveForm.duration,
        halfDayPeriod: editLeaveForm.duration === 'half_day' ? editLeaveForm.halfDayPeriod : null,
        dayValue: editLeaveForm.duration === 'half_day' ? 0.5 : 1,
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
    setBulkLeaveForm({ reason: '', duration: 'full_day' });
    setBulkLeaveSelectedDates([]);
    setBulkLeaveCalendarMonth(new Date().getMonth());
    setBulkLeaveCalendarYear(new Date().getFullYear());
    setBulkLeaveLimitErrors([]);
  };

  const toggleBulkLeaveEmployee = (id: string) => {
    const next = new Set(bulkLeaveSelectedIds);
    if (next.has(id)) {
      next.delete(id);
      setBulkLeaveSelectedIds(next);
      validateBulkLeaveSelection(next, bulkLeaveSelectedDates);
      return;
    }

    next.add(id);
    if (!validateBulkLeaveSelection(next, bulkLeaveSelectedDates)) return;
    setBulkLeaveSelectedIds(next);
  };

  const toggleBulkLeaveDate = (date: string) => {
    const nextDates = bulkLeaveSelectedDates.includes(date)
      ? bulkLeaveSelectedDates.filter((d) => d !== date)
      : [...bulkLeaveSelectedDates, date];

    if (bulkLeaveSelectedDates.includes(date)) {
      setBulkLeaveSelectedDates(nextDates);
      validateBulkLeaveSelection(bulkLeaveSelectedIds, nextDates);
      return;
    }

    if (!validateBulkLeaveSelection(bulkLeaveSelectedIds, nextDates)) return;
    setBulkLeaveSelectedDates(nextDates);
  };

  const toggleEditLeaveDate = (date: string) => {
    const selected = editLeaveForm.dates.includes(date);
    const nextForm = {
      ...editLeaveForm,
      dates: selected ? editLeaveForm.dates.filter((d) => d !== date) : [...editLeaveForm.dates, date],
    };
    if (!selected && !validateEditLeaveSelection(nextForm)) return;
    setEditLeaveForm(nextForm);
    if (selected) validateEditLeaveSelection(nextForm);
  };

  const handleBulkLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (bulkLeaveSelectedIds.size === 0 || bulkLeaveSelectedDates.length === 0 || !bulkLeaveForm.reason) return;
    setIsSavingBulkLeave(true);
    try {
      const db = getFirestore();
      const { latestLeaves, latestLimits } = await fetchLeaveValidationData();
      const failures = validateLeaveAssignments(
        getBulkLeaveProposals(bulkLeaveSelectedIds, bulkLeaveSelectedDates),
        latestLeaves,
        latestLimits,
      );
      if (failures.length > 0) {
        setBulkLeaveLimitErrors(formatLeaveLimitFailures(failures));
        return;
      }

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
            duration: bulkLeaveForm.duration,
            ...(bulkLeaveForm.halfDayPeriod ? { halfDayPeriod: bulkLeaveForm.halfDayPeriod } : {}),
            dayValue: bulkLeaveForm.duration === 'half_day' ? 0.5 : 1,
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

      const periodStartKey = getDateKey(PERIOD_START);
      const periodEndKey = getDateKey(PERIOD_END);
      setUnauthorizedPeriod({ start: periodStartKey, end: periodEndKey });

      // Fetch all shifts and convert to typed slots
      const shiftsSnap = await getDocs(collection(db, 'shifts'));
      const shiftSlots: ShiftSlotDocument[] = [];
      shiftsSnap.forEach((d) => {
        const data = d.data();
        shiftSlots.push({
          id: d.id,
          startTime: data.startTime ?? '',
          endTime: data.endTime ?? '',
          name: data.name,
          employees: (data.employees ?? []).map((e: any, index: number) => ({
            assignmentId: e.assignmentId || `${d.id}:legacy:${index}`,
            employeeCode: e.employeeCode ?? '',
            employeeName: e.employeeName ?? '',
            fromDate: e.fromDate,
            toDate: e.toDate,
          })),
        });
      });

      // Fetch all employees and build a normalized code -> employee map
      const employeesSnap = await getDocs(collection(db, 'employees'));
      const employeeByCode: Record<string, any> = {};
      employeesSnap.forEach((d) => {
        const data = d.data();
        const base = { id: d.id, ...data };
        [data.employeeCode, data.employeeCodeInDevice].forEach((code) => {
          const key = normalizeEmployeeCode(code);
          if (key) employeeByCode[key] = base;
        });
      });

      // Fetch all leaves (type=leave only, not weekoff)
      const leavesSnap = await getDocs(collection(db, 'leaves'));
      const leavesData: LeaveRecord[] = [];
      leavesSnap.forEach((d) => {
        const rec = { id: d.id, ...d.data() } as LeaveRecord;
        if (rec.type !== 'weekoff') leavesData.push(rec);
      });

      // Fetch all punches and group by normalized employee code
      const punchesSnap = await getDocs(collection(db, 'rawPunches'));
      const punchesByEmp: Record<string, RawPunch[]> = {};
      punchesSnap.forEach((d) => {
        const data = { id: d.id, ...d.data() } as RawPunch;
        const punchDate = getDateKey(data.logDate);
        if (punchDate < periodStartKey || punchDate > periodEndKey) return;
        const empCode = normalizeEmployeeCode(data.userId);
        if (!empCode) return;
        if (!punchesByEmp[empCode]) punchesByEmp[empCode] = [];
        punchesByEmp[empCode].push(data);
      });

      const results: any[] = [];
      const empCodesWithShifts = new Set<string>();
      shiftSlots.forEach((slot) => {
        slot.employees.forEach((emp) => {
          const code = normalizeEmployeeCode(emp.employeeCode);
          if (code) empCodesWithShifts.add(code);
        });
      });

      empCodesWithShifts.forEach((empCode) => {
        const employee = employeeByCode[empCode];
        const empName = employee?.employeeName ?? empCode;
        const empCodeInDevice = employee?.employeeCodeInDevice;

        const assignments = flattenShiftAssignments(shiftSlots, empCode);
        const empLeaves = leavesData.filter((l) => normalizeEmployeeCode(l.employeeCode) === empCode);
        const empWeekOffs = weekOffs.filter((w) => normalizeEmployeeCode(w.employeeCode) === empCode);

        const fullDayLeaveDates = new Set<string>();
        const halfDayLeaveMap: Record<string, 'first_half' | 'second_half'> = {};
        empLeaves.forEach((l) => {
          const dates = l.dates ?? (l.fromDate ? [l.fromDate] : []);
          dates.forEach((date) => {
            if (l.duration === 'half_day' && l.halfDayPeriod) {
              halfDayLeaveMap[date] = l.halfDayPeriod;
            } else {
              fullDayLeaveDates.add(date);
            }
          });
        });

        // Collect punches keyed by canonical code or device code
        const punchKeys = [empCode];
        const deviceKey = normalizeEmployeeCode(empCodeInDevice);
        if (deviceKey && deviceKey !== empCode) punchKeys.push(deviceKey);
        const empPunches = punchKeys.flatMap((key) => punchesByEmp[key] ?? []);

        for (let offset = 0; ; offset++) {
          const d = new Date(PERIOD_START);
          d.setDate(d.getDate() + offset);
          const dateStr = getDateKey(d);
          if (dateStr > periodEndKey) break;
          if (isFutureDate(dateStr)) continue;

          const dayName = getIstDayName(d);

          const resolution = resolveShiftAssignment(assignments, empCode, dateStr);
          if (resolution.status !== 'resolved') continue;
          const shift = resolution.assignment;

          // Skip approved full-day leave days
          if (fullDayLeaveDates.has(dateStr)) continue;

          // Skip week-offs
          const hasWeekOff = empWeekOffs.some((w) => (w.days ?? []).includes(dayName));
          if (hasWeekOff) continue;

          const startMinutes = timeToMinutes(shift.startTime ?? '00:00');
          const endMinutes = timeToMinutes(shift.endTime ?? '00:00');
          const isNight = endMinutes <= startMinutes;
          const shiftDurationMinutes = isNight
            ? 24 * 60 - startMinutes + endMinutes
            : endMinutes - startMinutes;

          const inPunches = empPunches.filter((p) => p.direction === 'in');
          const outPunches = empPunches.filter((p) => p.direction === 'out');

          let missingIn = false;
          let missingOut = false;
          const halfDayPeriod = halfDayLeaveMap[dateStr];

          if (halfDayPeriod) {
            // Only check punches that fall within the working half of the shift
            const midpoint = shiftDurationMinutes / 2;
            const inWorkingPunches = inPunches.filter((p) => {
              const m = getPunchMinutes(p.logDate);
              if (m === null) return false;
              const rel = shiftRelativeMinutes(m, startMinutes);
              return halfDayPeriod === 'first_half' ? rel >= midpoint : rel <= midpoint;
            });
            const outWorkingPunches = outPunches.filter((p) => {
              const m = getPunchMinutes(p.logDate);
              if (m === null) return false;
              const rel = shiftRelativeMinutes(m, startMinutes);
              return halfDayPeriod === 'first_half' ? rel >= midpoint : rel <= midpoint;
            });
            missingIn = inWorkingPunches.length === 0;
            missingOut = outWorkingPunches.length === 0;
          } else {
            const hasIn = inPunches.some((p) => getDateKey(p.logDate) === dateStr);
            missingIn = !hasIn;

            if (isNight) {
              const nextDateStr = addDaysIst(dateStr, 1);
              const cutoffMinutes = endMinutes + 120;
              const hasOut = outPunches.some((p) => {
                const punchDate = getDateKey(p.logDate);
                if (punchDate !== nextDateStr) return false;
                const m = getPunchMinutes(p.logDate);
                if (m === null) return false;
                return m <= cutoffMinutes;
              });
              missingOut = !hasOut;
            } else {
              const hasOut = outPunches.some((p) => getDateKey(p.logDate) === dateStr);
              missingOut = !hasOut;
            }
          }

          if (missingIn || missingOut) {
            results.push({
              employeeCode: empCode,
              employeeName: empName,
              date: dateStr,
              shiftStart: shift.startTime,
              shiftEnd: shift.endTime,
              missingIn,
              missingOut,
              isNightShift: isNight,
              halfDayPeriod,
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

  const filteredByControls = allRecords.filter((r) => {
    const data = r.data as any;

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
      return dates.some((d: string) => d >= fromDateFilter && d <= toDateFilter);
    }

    const from = data.fromDate;
    const to = data.toDate || from;
    if (from && to) {
      return from <= toDateFilter && to >= fromDateFilter;
    }

    return true;
  });

  const searchLower = searchQuery.toLowerCase();
  const filtered = filteredByControls.filter((record) => {
    const name = record.data.employeeName?.toLowerCase() ?? '';
    const code = record.data.employeeCode?.toLowerCase() ?? '';
    return name.includes(searchLower) || code.includes(searchLower);
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

  const calendarRange = getMonthRange(calendarYear, calendarMonth);
  const buildCalendarEntries = (records: typeof filtered) => {
    const result = records.reduce((entries, record) => {
      const data = record.data;
      let dates = data.dates && data.dates.length > 0
        ? data.dates
        : data.fromDate
          ? getDateRange(data.fromDate, data.toDate || data.fromDate)
          : [];

      if (dates.length === 0 && record.type === 'weekoff' && data.days?.length) {
        dates = getDateRange(calendarRange.from, calendarRange.to).filter((date) => {
          const [year, month, day] = date.split('-').map(Number);
          return data.days?.includes(ALL_DAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]);
        });
      }

      dates
        .filter((date) => date >= calendarRange.from && date <= calendarRange.to)
        .forEach((date) => {
          const entry: CalendarEntry = {
            key: `${data.id}:${date}`,
            date,
            employeeCode: data.employeeCode || '',
            employeeName: data.employeeName || '',
            type: record.type,
            reason: record.type === 'weekoff' ? 'Week Off' : (data.reason || 'Leave'),
            duration: data.duration,
            halfDayPeriod: data.halfDayPeriod,
          };
          const existing = entries.get(date) || [];
          if (!existing.some((item) => item.key === entry.key)) entries.set(date, [...existing, entry]);
        });
      return entries;
    }, new Map<string, CalendarEntry[]>());

    result.forEach((entries, date) => {
      result.set(date, entries.sort((a, b) => a.employeeName.localeCompare(b.employeeName)));
    });
    return result;
  };

  const calendarEntries = buildCalendarEntries(filtered);
  const colorScaleCalendarEntries = buildCalendarEntries(filteredByControls);
  const populatedEntryCounts = Array.from(colorScaleCalendarEntries.values()).map((entries) => entries.length);
  const minimumEntryCount = populatedEntryCounts.length > 0 ? Math.min(...populatedEntryCounts) : 0;
  const maximumEntryCount = populatedEntryCounts.length > 0 ? Math.max(...populatedEntryCounts) : 0;
  const heatmapStyles = [
    { count: 'text-green-500' },
    { count: 'text-lime-500' },
    { count: 'text-yellow-500' },
    { count: 'text-amber-500' },
    { count: 'text-orange-700' },
  ];
  const getHeatmapStyle = (count: number) => {
    if (count === 0) return null;
    if (minimumEntryCount === maximumEntryCount) return heatmapStyles[4];
    const normalized = (count - minimumEntryCount) / (maximumEntryCount - minimumEntryCount);
    return heatmapStyles[Math.min(4, Math.floor(normalized * 5))];
  };

  const setCalendarPeriod = (year: number, month: number) => {
    const range = getMonthRange(year, month);
    setCalendarYear(year);
    setCalendarMonth(month);
    setFromDateFilter(range.from);
    setToDateFilter(range.to);
    setSelectedCalendarDate(null);
  };

  const changeCalendarMonth = (offset: number) => {
    const date = new Date(calendarYear, calendarMonth + offset, 1);
    setCalendarPeriod(date.getFullYear(), date.getMonth());
  };

  const handleFromDateChange = (value: string) => {
    setFromDateFilter(value);
    if (!value) return;
    const [year, month] = value.split('-').map(Number);
    setCalendarYear(year);
    setCalendarMonth(month - 1);
  };

  const selectedCalendarEntries = selectedCalendarDate ? calendarEntries.get(selectedCalendarDate) || [] : [];
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => navigate('/attendance')} className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors">
          <ArrowLeft size={20} className="text-secondary-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-secondary-900">Week Off / Leave</h1>
          <p className="text-sm text-secondary-500">All employee leaves and week-off schedules</p>
        </div>
        <button onClick={fetchData} className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors">
          {loading ? <RedSpinner size="sm" /> : <RefreshCw size={18} className="text-secondary-500" />}
        </button>
      </div>

      {/* Search & Date Filter */}
      <div className="px-4 pt-3 pb-4">
        <div className="flex items-center gap-5 mb-4">
          {canManageLeaves && (
            <button onClick={() => { setBulkLeaveLimitErrors([]); setBulkLeaveModalOpen(true); }} className="flex-1 flex items-center justify-center gap-3 px-6 py-4 text-base font-medium text-white bg-indigo-600 border-2 border-indigo-500 rounded-2xl hover:bg-indigo-700 transition-colors shadow-sm">
              <Umbrella size={20} />
              Add Leaves
            </button>
          )}
          <button onClick={checkUnauthorizedAbsences} disabled={checkingAbsences} className="flex-1 flex items-center justify-center gap-3 px-6 py-4 text-base font-medium text-white bg-rose-600 border-2 border-rose-500 rounded-2xl hover:bg-rose-700 transition-colors disabled:opacity-70 shadow-sm">
            {checkingAbsences ? <RedSpinner size="sm" /> : <AlertTriangle size={18} />}
            Check Unauthorized Absence
          </button>
          <button onClick={() => navigate('/attendance/leave-counts')} className="flex-1 flex items-center justify-center gap-3 px-6 py-4 text-base font-medium text-white bg-teal-600 border-2 border-teal-500 rounded-2xl hover:bg-teal-700 transition-colors shadow-sm">
            <BarChart3 size={20} />
            Leave Counts
          </button>
        </div>
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
              onChange={(e) => handleFromDateChange(e.target.value)}
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
            <select
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as ViewMode)}
              className="px-3 py-2 text-sm border border-secondary-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-300"
            >
              <option value="calendar">Calendar View</option>
              <option value="cards">Card View</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'calendar' ? (
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <RedSpinner />
            </div>
          ) : (
            <div className="bg-white/90 rounded-2xl shadow-lg border border-secondary-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 sm:px-6 py-4 bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-purple-100">
                <button type="button" onClick={() => changeCalendarMonth(-1)} className="p-2 rounded-xl text-purple-700 bg-white border border-purple-100 shadow-sm hover:bg-purple-100 transition-colors" aria-label="Previous month">
                  <ChevronLeft size={20} />
                </button>
                <div className="text-center">
                  <h2 className="text-xl sm:text-2xl font-semibold text-secondary-900">
                    {new Date(calendarYear, calendarMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </h2>
                </div>
                <button type="button" onClick={() => changeCalendarMonth(1)} className="p-2 rounded-xl text-purple-700 bg-white border border-purple-100 shadow-sm hover:bg-purple-100 transition-colors" aria-label="Next month">
                  <ChevronRight size={20} />
                </button>
              </div>
              <div className="grid grid-cols-7 px-2 sm:px-4 pt-3 bg-white">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <div key={day} className={`py-2 text-center text-[11px] sm:text-xs font-semibold uppercase tracking-wide ${day === 'Sun' ? 'text-red-600' : 'text-black'}`}>{day}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2 p-2 sm:p-4 pt-1 sm:pt-1 bg-white">
                {(() => {
                  const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
                  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
                  const cells: (number | null)[] = [
                    ...Array(firstDay).fill(null),
                    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
                  ];
                  while (cells.length % 7 !== 0) cells.push(null);
                  return cells.map((day, index) => {
                    if (!day) return <div key={`empty-${index}`} className="min-h-20 sm:min-h-24 rounded-xl bg-secondary-50/60" />;
                    const date = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const entries = calendarEntries.get(date) || [];
                    const heatmapCount = colorScaleCalendarEntries.get(date)?.length || 0;
                    const heatmapStyle = getHeatmapStyle(heatmapCount);
                    const isSunday = index % 7 === 0;
                    return (
                      <button
                        key={date}
                        type="button"
                        onClick={() => entries.length > 0 && setSelectedCalendarDate(date)}
                        className={`relative min-h-20 sm:min-h-24 p-2 rounded-xl border border-secondary-100 bg-secondary-50 shadow-md flex flex-col items-center justify-center transition-all hover:bg-secondary-100 hover:shadow-lg hover:-translate-y-0.5 ${entries.length > 0 ? 'cursor-pointer' : 'cursor-default'}`}
                      >
                        {entries.length > 0 ? (
                          <div className={`absolute top-1.5 right-2 flex items-baseline gap-1 ${heatmapStyle?.count}`}>
                            <span className="text-sm sm:text-base font-bold leading-none">{entries.length}</span>
                            <Users size={16} aria-hidden="true" />
                          </div>
                        ) : (
                          <div className="absolute top-1.5 right-2 flex items-baseline gap-1">
                            <span className="text-xs sm:text-sm font-bold text-secondary-400 leading-none">0</span>
                            <Users size={16} className="text-secondary-400" aria-hidden="true" />
                          </div>
                        )}
                        <span className={`mt-4 inline-flex w-10 h-10 items-center justify-center rounded-full text-xl sm:text-2xl font-bold ${isSunday ? 'text-red-600' : 'text-black'}`}>{day}</span>
                      </button>
                    );
                  });
                })()}
              </div>
            </div>
          )}
        </div>
      ) : (
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
                              <span className={`text-xs px-1.5 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>{reason}{leave?.duration === 'half_day' ? ` · ${leave.halfDayPeriod === 'first_half' ? 'First Half' : 'Second Half'}` : ''}</span>
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
      )}

      {selectedCalendarDate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedCalendarDate(null)}>
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[80vh] overflow-hidden shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-secondary-200">
              <div>
                <h2 className="text-base font-semibold text-secondary-900">Leave / Off Details</h2>
                <p className="text-sm text-secondary-500">{formatDate(selectedCalendarDate)}</p>
              </div>
              <button type="button" onClick={() => setSelectedCalendarDate(null)} className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors" aria-label="Close calendar details">
                <X size={18} className="text-secondary-500" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh] space-y-2">
              {selectedCalendarEntries.map((entry) => {
                const colors = entry.type === 'weekoff' ? { badge: 'bg-blue-100', text: 'text-blue-700' } : getLeaveColor(entry.reason);
                const period = entry.duration === 'half_day'
                  ? entry.halfDayPeriod === 'first_half' ? 'First Half' : 'Second Half'
                  : 'Full Day';
                return (
                  <div key={entry.key} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-secondary-50 rounded-lg">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-secondary-900 truncate">{entry.employeeName || 'Unnamed Employee'}</p>
                      <p className="text-xs text-secondary-500">{entry.employeeCode || '—'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`inline-flex text-xs font-medium px-2 py-1 rounded-full ${colors.badge} ${colors.text}`}>{entry.reason}</span>
                      {entry.type === 'leave' && <p className="text-[11px] text-secondary-500 mt-1">{period}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

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
                          {matchingLeave && canManageLeaves && (
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
                <p className="text-xs text-secondary-500">
                  {unauthorizedPeriod ? `${formatDate(unauthorizedPeriod.start)} — ${formatDate(unauthorizedPeriod.end)} (30 days)` : ''}
                </p>
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
                        <p className="text-sm text-red-600 mt-0.5">
                          {formatDate(result.date)}
                          {result.isNightShift && ' (night shift)'}
                          {result.halfDayPeriod === 'first_half' && ' · half-day (second half working)'}
                          {result.halfDayPeriod === 'second_half' && ' · half-day (first half working)'}
                        </p>
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
                              onClick={() => toggleBulkLeaveDate(dateStr)}
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
                <select value={bulkLeaveForm.reason} onChange={(e) => updateBulkLeaveForm({ ...bulkLeaveForm, reason: e.target.value })}
                  className="w-full px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" required>
                  <option value="">Select leave type...</option>
                  <option value="Week Off">Week Off</option>
                  <option value="Casual Leave">Casual Leave</option>
                  <option value="Earned Leave">Earned Leave</option>
                  <option value="Holiday Off">Holiday Off</option>
                  <option value="Overtime Off">Overtime Off</option>
                </select>
                <label className="block text-sm font-medium text-secondary-700 mt-3 mb-2">Duration</label>
                <select value={bulkLeaveForm.duration === 'full_day' ? 'full_day' : bulkLeaveForm.halfDayPeriod}
                  onChange={(e) => updateBulkLeaveForm(e.target.value === 'full_day' ? { ...bulkLeaveForm, duration: 'full_day', halfDayPeriod: undefined } : { ...bulkLeaveForm, duration: 'half_day', halfDayPeriod: e.target.value as 'first_half' | 'second_half' })}
                  className="w-full px-3 py-2 border border-secondary-200 rounded-lg text-sm">
                  <option value="full_day">Full Day</option>
                  <option value="first_half">Half Day (First)</option>
                  <option value="second_half">Half Day (Second)</option>
                </select>
              </div>

              {bulkLeaveAvailability.length > 0 ? (
                <LeaveAvailabilitySummary summaries={bulkLeaveAvailability} aggregate title="Selected Leave Availability" />
              ) : (
                <p className="text-xs text-secondary-500">Select employees, dates, and a leave type to view assigned, used, and remaining counts.</p>
              )}

              {bulkLeaveLimitErrors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                  <p className="text-sm font-medium text-red-700 mb-1">Leave limit check failed</p>
                  <ul className="list-disc pl-5 space-y-1 text-xs text-red-700">
                    {bulkLeaveLimitErrors.map((message) => <li key={message}>{message}</li>)}
                  </ul>
                </div>
              )}

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
                              onClick={() => toggleEditLeaveDate(dateStr)}
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
                <select value={editLeaveForm.reason} onChange={(e) => updateEditLeaveForm({ ...editLeaveForm, reason: e.target.value })}
                  className="w-full px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" required>
                  <option value="">Select leave type...</option>
                  <option value="Week Off">Week Off</option>
                  <option value="Casual Leave">Casual Leave</option>
                  <option value="Earned Leave">Earned Leave</option>
                  <option value="Holiday Off">Holiday Off</option>
                  <option value="Overtime Off">Overtime Off</option>
                </select>
                <label className="block text-sm font-medium text-secondary-700 mt-3 mb-2">Duration</label>
                <select value={editLeaveForm.duration === 'full_day' ? 'full_day' : editLeaveForm.halfDayPeriod}
                  onChange={(e) => updateEditLeaveForm(e.target.value === 'full_day' ? { ...editLeaveForm, duration: 'full_day', halfDayPeriod: undefined } : { ...editLeaveForm, duration: 'half_day', halfDayPeriod: e.target.value as 'first_half' | 'second_half' })}
                  className="w-full px-3 py-2 border border-secondary-200 rounded-lg text-sm">
                  <option value="full_day">Full Day</option>
                  <option value="first_half">Half Day (First)</option>
                  <option value="second_half">Half Day (Second)</option>
                </select>
              </div>
              {editLeaveAvailability.length > 0 && (
                <LeaveAvailabilitySummary summaries={editLeaveAvailability} title="Updated Leave Availability" />
              )}
              {editLeaveLimitErrors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                  <p className="text-sm font-medium text-red-700 mb-1">Leave limit check failed</p>
                  <ul className="list-disc pl-5 space-y-1 text-xs text-red-700">
                    {editLeaveLimitErrors.map((message) => <li key={message}>{message}</li>)}
                  </ul>
                </div>
              )}
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
