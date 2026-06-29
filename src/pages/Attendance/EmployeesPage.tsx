import React, { useState, useEffect } from 'react';
import { ArrowLeft, Search, RefreshCw, Users, Clock, Plus, Edit, Eye, X, CalendarDays, LogIn, LogOut, ChevronLeft, ChevronRight, Umbrella, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getFirestore, collection, getDocs, query, orderBy, where, addDoc, updateDoc, deleteDoc, serverTimestamp, doc, arrayUnion } from 'firebase/firestore';

import { db } from '@/firebase/firebase';
import { useAuthContext } from '@/contexts/AuthContext';

interface RawPunch {
  id: string;
  deviceId?: number;
  deviceLogId?: string;
  direction?: string;
  logDate?: any;
  month?: number;
  sourceTable?: string;
  userId?: string;
  verificationMode?: string;
  year?: number;
}

interface DayAttendance {
  date: string;
  punches: RawPunch[];
}

const toDate = (logDate: any): Date | null => {
  if (!logDate) return null;
  if (logDate?.toDate) return logDate.toDate();
  if (logDate instanceof Date) return logDate;
  return null;
};

const formatDisplayDate = (logDate: any): string => {
  const d = toDate(logDate);
  if (!d) return '—';
  return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
};

const formatTime = (logDate: any): string => {
  const d = toDate(logDate);
  if (!d) return '—';
  return d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
};

const formatDuration = (ms: number): string => {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
};

const getDateKey = (logDate: any): string => {
  const d = toDate(logDate);
  if (!d) return 'unknown';
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

interface Employee {
  id: string;
  employeeCode?: string;
  employeeCodeInDevice?: string;
  employeeId?: string;
  employeeName?: string;
  syncedAt?: any;
}

export const EmployeesPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuthContext();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [showAddShiftForm, setShowAddShiftForm] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [successMessage, setSuccessMessage] = useState('Shift Saved Successfully');
  const [showOverlapDialog, setShowOverlapDialog] = useState(false);
  const [overlappingShifts, setOverlappingShifts] = useState<any[]>([]);
  const [isSavingShift, setIsSavingShift] = useState(false);
  const [showViewShifts, setShowViewShifts] = useState(false);
  const [showEditShiftForm, setShowEditShiftForm] = useState(false);
  const [employeeShifts, setEmployeeShifts] = useState<any[]>([]);
  const [shiftsLoading, setShiftsLoading] = useState(false);
  const [selectedShift, setSelectedShift] = useState<any>(null);
  const [editShiftForm, setEditShiftForm] = useState({
    fromDate: '',
    toDate: '',
    startHour: '9',
    startMinute: '00',
    startAmPm: 'AM',
    endHour: '6',
    endMinute: '00',
    endAmPm: 'PM'
  });
  const [bulkAssignModalOpen, setBulkAssignModalOpen] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set());
  const [bulkSearchQuery, setBulkSearchQuery] = useState('');
  const [bulkShiftForm, setBulkShiftForm] = useState({
    fromDate: '',
    toDate: '',
    startHour: '',
    startMinute: '',
    startAmPm: 'AM',
    endHour: '',
    endMinute: '',
    endAmPm: 'AM'
  });
  const [bulkSelectedTemplate, setBulkSelectedTemplate] = useState<{ startTime: string; endTime: string } | null>(null);
  const [isBulkAssigning, setIsBulkAssigning] = useState(false);
  const [bulkOverlapResults, setBulkOverlapResults] = useState<{ employee: Employee; overlaps: any[] }[]>([]);
  const [showBulkOverlapDialog, setShowBulkOverlapDialog] = useState(false);
  const [shiftTemplates, setShiftTemplates] = useState<{ startTime: string; endTime: string }[]>([]);
  const [bulkShiftMode, setBulkShiftMode] = useState<'existing' | 'new'>('existing');
  const [shiftMode, setShiftMode] = useState<'existing' | 'new'>('existing');
  const [selectedShiftTemplate, setSelectedShiftTemplate] = useState<{ startTime: string; endTime: string } | null>(null);
  const [shiftForm, setShiftForm] = useState({
    fromDate: '',
    toDate: '',
    startHour: '',
    startMinute: '',
    startAmPm: 'AM',
    endHour: '',
    endMinute: '',
    endAmPm: 'AM'
  });
  const [attendanceModalOpen, setAttendanceModalOpen] = useState(false);
  const [attendanceEmployee, setAttendanceEmployee] = useState<Employee | null>(null);
  const [attendancePunches, setAttendancePunches] = useState<RawPunch[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceMonth, setAttendanceMonth] = useState<number>(new Date().getMonth() + 1);
  const [attendanceYear, setAttendanceYear] = useState<number>(new Date().getFullYear());
  const [employeeAttendanceShifts, setEmployeeAttendanceShifts] = useState<any[]>([]);
  const [attendanceLeaves, setAttendanceLeaves] = useState<any[]>([]);

  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [leaveEmployee, setLeaveEmployee] = useState<Employee | null>(null);
  const [leaveTab, setLeaveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [weekOffDays, setWeekOffDays] = useState<string[]>([]); // Used for week-off functionality
  const [leaveForm, setLeaveForm] = useState({ reason: '' });
  const [selectedLeaveDates, setSelectedLeaveDates] = useState<string[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [isSavingLeave, setIsSavingLeave] = useState(false);
  const [existingWeekOff, setExistingWeekOff] = useState<any | null>(null); // Used for week-off functionality
  const [employeeLeaves, setEmployeeLeaves] = useState<any[]>([]);
  const [leavesLoading, setLeavesLoading] = useState(false);
  const [showAddLeaveForm, setShowAddLeaveForm] = useState(false);
  const [editingLeave, setEditingLeave] = useState<any | null>(null);
  const [editLeaveForm, setEditLeaveForm] = useState({ reason: '' });
  const [editSelectedDates, setEditSelectedDates] = useState<string[]>([]);
  const [editCalendarMonth, setEditCalendarMonth] = useState(new Date().getMonth());
  const [editCalendarYear, setEditCalendarYear] = useState(new Date().getFullYear());
  const [isSavingEditLeave, setIsSavingEditLeave] = useState(false);
  const [deletingLeaveId, setDeletingLeaveId] = useState<string | null>(null);
  const [bulkLeaveModalOpen, setBulkLeaveModalOpen] = useState(false);
  const [bulkLeaveSelectedIds, setBulkLeaveSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLeaveSearchQuery, setBulkLeaveSearchQuery] = useState('');
  const [bulkLeaveForm, setBulkLeaveForm] = useState({ reason: '' });
  const [bulkLeaveSelectedDates, setBulkLeaveSelectedDates] = useState<string[]>([]);
  const [bulkLeaveCalendarMonth, setBulkLeaveCalendarMonth] = useState(new Date().getMonth());
  const [bulkLeaveCalendarYear, setBulkLeaveCalendarYear] = useState(new Date().getFullYear());
  const [isSavingBulkLeave, setIsSavingBulkLeave] = useState(false);

  const fetchEmployees = async () => {
    if (!currentUser) return;
    
    try {
      const db = getFirestore();
      const employeesRef = collection(db, 'employees');
      const q = query(employeesRef, orderBy('employeeName'));
      const snapshot = await getDocs(q);
      
      const employeesData: Employee[] = [];
      snapshot.forEach((doc) => {
        employeesData.push({
          id: doc.id,
          ...doc.data(),
        });
      });
      
      setEmployees(employeesData);
    } catch (error) {
      console.error('Error fetching employees:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, [currentUser]);

  const filteredEmployees = employees.filter((emp) => {
    // Exclude employees with device code starting with "Del"
    if (emp.employeeCodeInDevice?.startsWith('Del')) {
      return false;
    }

    const searchLower = searchQuery.toLowerCase();
    return (
      emp.employeeName?.toLowerCase().includes(searchLower) ||
      emp.employeeCode?.toLowerCase().includes(searchLower) ||
      emp.employeeId?.toLowerCase().includes(searchLower)
    );
  });

  const handleShiftsClick = (employee: Employee) => {
    setSelectedEmployee(employee);
    setShiftModalOpen(true);
  };

  const fetchAttendanceLeavesForMonth = async (employee: Employee, month: number, year: number) => {
    if (!employee.employeeCode) return;
    try {
      const db = getFirestore();
      const q = query(collection(db, 'leaves'), where('employeeCode', '==', employee.employeeCode));
      const snapshot = await getDocs(q);
      const leaves: any[] = [];
      snapshot.forEach((d) => leaves.push({ id: d.id, ...d.data() }));
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      // Filter leaves that fall within the given month/year and are not in the future
      const filtered = leaves.filter((leave) => {
        const dates: string[] = leave.dates ?? (leave.fromDate ? [leave.fromDate] : []);
        return dates.some((dateStr) => {
          const d = new Date(dateStr);
          return d.getMonth() + 1 === month && d.getFullYear() === year && d <= today;
        });
      });
      setAttendanceLeaves(filtered);
    } catch (e) {
      console.error('Error fetching attendance leaves:', e);
    }
  };

  const handleViewAttendanceClick = async (employee: Employee) => {
    if (!employee.employeeCode) return;
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    setAttendanceMonth(currentMonth);
    setAttendanceYear(currentYear);
    setAttendanceEmployee(employee);
    setAttendanceModalOpen(true);
    setAttendanceLoading(true);
    setAttendancePunches([]);
    setAttendanceLeaves([]);
    fetchAttendanceShifts(employee);
    fetchAttendanceLeavesForMonth(employee, currentMonth, currentYear);
    try {
      const rawPunchesRef = collection(db, 'rawPunches');
      const q = query(
        rawPunchesRef,
        where('userId', '==', employee.employeeCode),
        where('month', '==', currentMonth),
        where('year', '==', currentYear),
        orderBy('logDate', 'desc')
      );
      const snapshot = await getDocs(q);
      const punches: RawPunch[] = [];
      snapshot.forEach((doc) => punches.push({ id: doc.id, ...doc.data() }));
      setAttendancePunches(punches);
    } catch (error) {
      console.error('Error fetching attendance:', error);
    } finally {
      setAttendanceLoading(false);
    }
  };

  const fetchAttendanceForMonth = async (employee: Employee, month: number, year: number) => {
    if (!employee.employeeCode) return;
    setAttendanceLoading(true);
    setAttendancePunches([]);
    try {
      const rawPunchesRef = collection(db, 'rawPunches');
      const q = query(
        rawPunchesRef,
        where('userId', '==', employee.employeeCode),
        where('month', '==', month),
        where('year', '==', year),
        orderBy('logDate', 'desc')
      );
      const snapshot = await getDocs(q);
      const punches: RawPunch[] = [];
      snapshot.forEach((doc) => punches.push({ id: doc.id, ...doc.data() }));
      setAttendancePunches(punches);
    } catch (error) {
      console.error('Error fetching attendance:', error);
    } finally {
      setAttendanceLoading(false);
    }
  };

  const handleAttendanceMonthChange = (delta: number) => {
    let newMonth = attendanceMonth + delta;
    let newYear = attendanceYear;
    if (newMonth > 12) { newMonth = 1; newYear += 1; }
    if (newMonth < 1) { newMonth = 12; newYear -= 1; }
    setAttendanceMonth(newMonth);
    setAttendanceYear(newYear);
    if (attendanceEmployee) {
      fetchAttendanceForMonth(attendanceEmployee, newMonth, newYear);
      fetchAttendanceShifts(attendanceEmployee);
      fetchAttendanceLeavesForMonth(attendanceEmployee, newMonth, newYear);
    }
  };

  const closeAttendanceModal = () => {
    setAttendanceModalOpen(false);
    setAttendanceEmployee(null);
    setAttendancePunches([]);
    setEmployeeAttendanceShifts([]);
    setAttendanceLeaves([]);
  };

  const fetchLeavesForEmployee = async (employee: Employee) => {
    if (!employee.employeeCode) return;
    setLeavesLoading(true);
    try {
      const db = getFirestore();
      const q = query(collection(db, 'leaves'), where('employeeCode', '==', employee.employeeCode), orderBy('fromDate', 'desc'));
      const snapshot = await getDocs(q);
      const leaves: any[] = [];
      snapshot.forEach((d) => leaves.push({ id: d.id, ...d.data() }));
      setEmployeeLeaves(leaves);
    } catch (e) {
      console.error('Error fetching leaves:', e);
    } finally {
      setLeavesLoading(false);
    }
  };

  const handleLeaveClick = async (employee: Employee) => {
    setLeaveEmployee(employee);
    setLeaveTab('upcoming');
    setWeekOffDays([]);
    setLeaveForm({ reason: '' });
    setSelectedLeaveDates([]);
    setCalendarMonth(new Date().getMonth());
    setCalendarYear(new Date().getFullYear());
    setExistingWeekOff(null);
    setEmployeeLeaves([]);
    setShowAddLeaveForm(false);
    setLeaveModalOpen(true);
    fetchLeavesForEmployee(employee);
    try {
      const db = getFirestore();
      const q = query(collection(db, 'weekOffs'), where('employeeCode', '==', employee.employeeCode));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const data = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
        setExistingWeekOff(data);
        setWeekOffDays((data as any).days ?? []);
      }
    } catch (e) {
      console.error('Error fetching week off:', e);
    }
  };

  const handleEditLeaveClick = (leave: any) => {
    setEditingLeave(leave);
    setEditLeaveForm({ reason: leave.reason ?? '' });
    const dates: string[] = leave.dates ?? (leave.fromDate ? [leave.fromDate] : []);
    setEditSelectedDates(dates);
    if (dates.length > 0) {
      const [y, m] = dates[0].split('-').map(Number);
      setEditCalendarMonth(m - 1);
      setEditCalendarYear(y);
    } else {
      setEditCalendarMonth(new Date().getMonth());
      setEditCalendarYear(new Date().getFullYear());
    }
  };

  const handleSaveEditLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLeave || editSelectedDates.length === 0) return;
    setIsSavingEditLeave(true);
    try {
      const db = getFirestore();
      const sorted = [...editSelectedDates].sort();
      await updateDoc(doc(db, 'leaves', editingLeave.id), {
        dates: sorted,
        fromDate: sorted[0],
        toDate: sorted[sorted.length - 1],
        reason: editLeaveForm.reason,
      });
      setEditingLeave(null);
      setSuccessMessage('Leave Updated Successfully');
      setShowSuccessDialog(true);
      if (leaveEmployee) fetchLeavesForEmployee(leaveEmployee);
    } catch (e) {
      console.error('Error updating leave:', e);
    } finally {
      setIsSavingEditLeave(false);
    }
  };

  const handleDeleteLeave = async (leaveId: string) => {
    if (!window.confirm('Delete this leave record?')) return;
    setDeletingLeaveId(leaveId);
    try {
      const db = getFirestore();
      await deleteDoc(doc(db, 'leaves', leaveId));
      if (leaveEmployee) fetchLeavesForEmployee(leaveEmployee);
    } catch (e) {
      console.error('Error deleting leave:', e);
    } finally {
      setDeletingLeaveId(null);
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
      setSuccessMessage(`Leave added for ${bulkLeaveSelectedIds.size} employee(s) successfully`);
      setShowSuccessDialog(true);
      closeBulkLeaveModal();
    } catch (err) {
      console.error('Error saving bulk leave:', err);
    } finally {
      setIsSavingBulkLeave(false);
    }
  };

  const handleSaveLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveEmployee || selectedLeaveDates.length === 0) return;
    setIsSavingLeave(true);
    try {
      const db = getFirestore();
      const sorted = [...selectedLeaveDates].sort();
      await addDoc(collection(db, 'leaves'), {
        employeeId: leaveEmployee.id,
        employeeCode: leaveEmployee.employeeCode,
        employeeName: leaveEmployee.employeeName,
        dates: sorted,
        fromDate: sorted[0],
        toDate: sorted[sorted.length - 1],
        reason: leaveForm.reason,
        createdAt: serverTimestamp(),
        createdBy: currentUser?.uid
      });
      setSuccessMessage('Leave Assigned Successfully');
      setShowSuccessDialog(true);
      setLeaveForm({ reason: '' });
      setSelectedLeaveDates([]);
      setShowAddLeaveForm(false);
      fetchLeavesForEmployee(leaveEmployee);
    } catch (e) {
      console.error('Error saving leave:', e);
    } finally {
      setIsSavingLeave(false);
    }
  };

  const fetchAttendanceShifts = async (employee: Employee) => {
    if (!employee.employeeCode) return;
    try {
      const db = getFirestore();
      const shiftsRef = collection(db, 'shifts');
      const snapshot = await getDocs(shiftsRef);
      const shifts: any[] = [];
      const empCode = (employee.employeeCode ?? '').trim().toLowerCase();
      snapshot.forEach((doc) => {
        const data = doc.data();
        const employees: any[] = data.employees ?? [];
        const entry = employees.find((e) => (e.employeeCode ?? '').trim().toLowerCase() === empCode);
        if (entry) {
          shifts.push({
            id: doc.id,
            startTime: data.startTime,
            endTime: data.endTime,
            fromDate: entry.fromDate ?? '',
            toDate: entry.toDate ?? '',
          });
        }
      });
      setEmployeeAttendanceShifts(shifts);
    } catch (error) {
      console.error('Error fetching attendance shifts:', error);
    }
  };

  const findShiftForDate = (dateStr: string, shifts: any[]) => {
    const date = new Date(dateStr);
    return shifts.find((shift) => {
      // If no date range is specified, the shift applies to all dates
      if (!shift.fromDate && !shift.toDate) return true;
      // If only one date is specified, check that specific date
      if (shift.fromDate && !shift.toDate) return dateStr === shift.fromDate;
      if (!shift.fromDate && shift.toDate) return dateStr === shift.toDate;
      // If both dates are specified, check the range
      const fromDate = new Date(shift.fromDate);
      const toDate = new Date(shift.toDate);
      return date >= fromDate && date <= toDate;
    });
  };

  const getPunchTimeInMinutes = (logDate: any): number | null => {
    const d = toDate(logDate);
    if (!d) return null;
    return d.getHours() * 60 + d.getMinutes();
  };

  const getShiftTimeInMinutes = (timeStr: string) => {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  };

  const formatMinutesDiff = (minutes: number) => {
    const hours = Math.floor(Math.abs(minutes) / 60);
    const mins = Math.abs(minutes) % 60;
    if (hours === 0) return `${mins}m`;
    return `${hours}h ${mins.toString().padStart(2, '0')}m`;
  };

  const groupedAttendance = (): DayAttendance[] => {
    const map: Record<string, RawPunch[]> = {};
    attendancePunches.forEach((p) => {
      const key = getDateKey(p.logDate);
      if (!map[key]) map[key] = [];
      map[key].push(p);
    });
    return Object.entries(map)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, punches]) => ({ date, punches }));
  };

  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const normalizeTimeRange = (startMin: number, endMin: number) => {
    if (endMin <= startMin) {
      return [
        { start: startMin, end: 24 * 60 },
        { start: 0, end: endMin }
      ];
    }
    return [{ start: startMin, end: endMin }];
  };

  const timeRangesOverlap = (start1: number, end1: number, start2: number, end2: number) => {
    const ranges1 = normalizeTimeRange(start1, end1);
    const ranges2 = normalizeTimeRange(start2, end2);
    for (const r1 of ranges1) {
      for (const r2 of ranges2) {
        if (r1.start < r2.end && r2.start < r1.end) return true;
      }
    }
    return false;
  };

  const timeToMinutes = (time24: string) => {
    const [h, m] = time24.split(':').map(Number);
    return h * 60 + m;
  };

  const formatShiftDate = (dateString: string) => {
    const d = new Date(dateString);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatTime12 = (time24: string) => {
    const [h, m] = time24.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  const to24Hour = (hour: string, minute: string, ampm: string) => {
    let h = parseInt(hour, 10);
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return `${h.toString().padStart(2, '0')}:${minute}`;
  };

  const to12Hour = (time24: string) => {
    const [h, m] = time24.split(':');
    let hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
    return { hour: hour.toString(), minute: m, ampm };
  };

  const findOverlappingShifts = (newShift: any, existingShifts: any[]) => {
    const newFrom = new Date(newShift.fromDate);
    const newTo = new Date(newShift.toDate);
    const newStart = timeToMinutes(newShift.startTime);
    const newEnd = timeToMinutes(newShift.endTime);

    return existingShifts.filter((shift) => {
      const existingStart = timeToMinutes(shift.startTime);
      const existingEnd = timeToMinutes(shift.endTime);
      if (!timeRangesOverlap(newStart, newEnd, existingStart, existingEnd)) return false;
      // Check if any employee entry in this shift has a date range overlapping newShift
      const employees: any[] = shift.employees ?? [];
      return employees.some((em) => {
        if (!em.fromDate || !em.toDate) return true;
        const existingFrom = new Date(em.fromDate);
        const existingTo = new Date(em.toDate);
        return newFrom <= existingTo && existingFrom <= newTo;
      });
    });
  };

  const handleShiftAction = async (action: 'view' | 'add' | 'edit') => {
    if (action === 'add') {
      setShowAddShiftForm(true);
      fetchShiftTemplates();
    } else if (action === 'view') {
      setShowViewShifts(true);
      await fetchShiftsForEmployee();
    } else {
      console.log(`Action: ${action} for employee: ${selectedEmployee?.employeeName}`);
    }
  };

  const fetchShiftsForEmployee = async () => {
    if (!selectedEmployee) return;
    setShiftsLoading(true);
    try {
      const db = getFirestore();
      const snapshot = await getDocs(collection(db, 'shifts'));
      const shifts: any[] = [];
      const empCode = (selectedEmployee.employeeCode ?? '').trim().toLowerCase();
      snapshot.forEach((doc) => {
        const data = doc.data();
        const employees: any[] = data.employees ?? [];
        const entry = employees.find((e) => (e.employeeCode ?? '').trim().toLowerCase() === empCode);
        if (entry) {
          shifts.push({
            id: doc.id,
            startTime: data.startTime,
            endTime: data.endTime,
            fromDate: entry.fromDate ?? '',
            toDate: entry.toDate ?? '',
          });
        }
      });
      shifts.sort((a, b) => (b.fromDate ?? '').localeCompare(a.fromDate ?? ''));
      setEmployeeShifts(shifts);
    } catch (error) {
      console.error('Error fetching shifts:', error);
    } finally {
      setShiftsLoading(false);
    }
  };

  const handleEditShift = (shift: any) => {
    setSelectedShift(shift);
    const start = to12Hour(shift.startTime);
    const end = to12Hour(shift.endTime);

    setEditShiftForm({
      fromDate: shift.fromDate,
      toDate: shift.toDate,
      startHour: start.hour,
      startMinute: start.minute,
      startAmPm: start.ampm,
      endHour: end.hour,
      endMinute: end.minute,
      endAmPm: end.ampm
    });
    setShowViewShifts(false);
    setShowEditShiftForm(true);
  };

  const handleEditShiftSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShift || !selectedEmployee) return;

    setIsSavingShift(true);
    try {
      const db = getFirestore();
      const startTime24 = to24Hour(editShiftForm.startHour, editShiftForm.startMinute, editShiftForm.startAmPm);
      const endTime24 = to24Hour(editShiftForm.endHour, editShiftForm.endMinute, editShiftForm.endAmPm);

      const newShiftData = {
        fromDate: editShiftForm.fromDate,
        toDate: editShiftForm.toDate,
        startTime: startTime24,
        endTime: endTime24
      };

      // Check for overlaps excluding the current shift being edited
      const shiftsRef = collection(db, 'shifts');
      const q = query(shiftsRef, where('employeeCode', '==', selectedEmployee.employeeCode));
      const snapshot = await getDocs(q);
      const existingShifts: any[] = [];
      snapshot.forEach((doc) => {
        if (doc.id !== selectedShift.id) existingShifts.push({ id: doc.id, ...doc.data() });
      });

      const overlaps = findOverlappingShifts(newShiftData, existingShifts);
      if (overlaps.length > 0) {
        setOverlappingShifts(overlaps);
        setShowOverlapDialog(true);
        setIsSavingShift(false);
        return;
      }

      const shiftRef = doc(db, 'shifts', selectedShift.id);
      await updateDoc(shiftRef, {
        fromDate: editShiftForm.fromDate,
        toDate: editShiftForm.toDate,
        startTime: startTime24,
        endTime: endTime24,
        updatedAt: serverTimestamp()
      });

      console.log('Shift updated successfully');
      setShowEditShiftForm(false);
      setSelectedShift(null);
      setShowViewShifts(true);
      await fetchShiftsForEmployee();
      setSuccessMessage('Shift Updated Successfully');
      setShowSuccessDialog(true);
    } catch (error) {
      console.error('Error updating shift:', error);
    } finally {
      setIsSavingShift(false);
    }
  };

  const handleShiftFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;

    setIsSavingShift(true);
    try {
      const db = getFirestore();
      const startTime24 = shiftMode === 'existing' && selectedShiftTemplate
        ? selectedShiftTemplate.startTime
        : to24Hour(shiftForm.startHour, shiftForm.startMinute, shiftForm.startAmPm);
      const endTime24 = shiftMode === 'existing' && selectedShiftTemplate
        ? selectedShiftTemplate.endTime
        : to24Hour(shiftForm.endHour, shiftForm.endMinute, shiftForm.endAmPm);
      const newShift = { fromDate: shiftForm.fromDate, toDate: shiftForm.toDate, startTime: startTime24, endTime: endTime24 };

      const shiftsRef = collection(db, 'shifts');

      // Overlap check: find all docs where this employee appears
      const allSnap = await getDocs(query(shiftsRef));
      const allDocs: any[] = [];
      allSnap.forEach((d) => allDocs.push({ id: d.id, ...d.data() }));
      const docsWithEmp = allDocs.filter((s) => (s.employees ?? []).some((em: any) => em.employeeCode === selectedEmployee.employeeCode));
      const overlaps = findOverlappingShifts(newShift, docsWithEmp);
      if (overlaps.length > 0) {
        setOverlappingShifts(overlaps);
        setShowOverlapDialog(true);
        setIsSavingShift(false);
        return;
      }

      const empEntry = { employeeCode: selectedEmployee.employeeCode ?? '', employeeName: selectedEmployee.employeeName ?? '', fromDate: shiftForm.fromDate, toDate: shiftForm.toDate };

      // Find existing doc for this exact time slot (one doc per startTime+endTime)
      const slotSnap = await getDocs(query(shiftsRef,
        where('startTime', '==', startTime24),
        where('endTime', '==', endTime24)
      ));

      if (!slotSnap.empty) {
        await updateDoc(doc(db, 'shifts', slotSnap.docs[0].id), { employees: arrayUnion(empEntry) });
      } else {
        await addDoc(shiftsRef, { startTime: startTime24, endTime: endTime24, employees: [empEntry], createdAt: serverTimestamp(), createdBy: currentUser?.uid });
      }

      setShowAddShiftForm(false);
      setShiftForm({ fromDate: '', toDate: '', startHour: '', startMinute: '', startAmPm: 'AM', endHour: '', endMinute: '', endAmPm: 'AM' });
      setShiftModalOpen(false);
      setSuccessMessage('Shift Saved Successfully');
      setShowSuccessDialog(true);
    } catch (error) {
      console.error('Error saving shift:', error);
    } finally {
      setIsSavingShift(false);
    }
  };

  const handleShiftFormCancel = () => {
    setShowAddShiftForm(false);
    setShiftMode('existing');
    setSelectedShiftTemplate(null);
    setShiftForm({ fromDate: '', toDate: '', startHour: '', startMinute: '', startAmPm: 'AM', endHour: '', endMinute: '', endAmPm: 'AM' });
  };

  const closeModal = () => {
    setShiftModalOpen(false);
    setSelectedEmployee(null);
    setShowAddShiftForm(false);
    setShowViewShifts(false);
    setShowEditShiftForm(false);
    setShowOverlapDialog(false);
    setShiftMode('existing');
    setSelectedShiftTemplate(null);
    setShiftForm({ fromDate: '', toDate: '', startHour: '', startMinute: '', startAmPm: 'AM', endHour: '', endMinute: '', endAmPm: 'AM' });
    setEmployeeShifts([]);
    setSelectedShift(null);
    setOverlappingShifts([]);
  };

  const toggleEmployeeSelection = (id: string) => {
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fetchShiftTemplates = async () => {
    try {
      const db = getFirestore();
      const snap = await getDocs(query(collection(db, 'shifts'), orderBy('startTime')));
      const seen = new Set<string>();
      const templates: { startTime: string; endTime: string }[] = [];
      snap.forEach((d) => {
        const data = d.data();
        const key = `${data.startTime}|${data.endTime}`;
        if (!seen.has(key)) { seen.add(key); templates.push({ startTime: data.startTime, endTime: data.endTime }); }
      });
      setShiftTemplates(templates);
    } catch (e) { console.error(e); }
  };

  const closeBulkAssignModal = () => {
    setBulkAssignModalOpen(false);
    setSelectedEmployeeIds(new Set());
    setBulkShiftForm({ fromDate: '', toDate: '', startHour: '', startMinute: '', startAmPm: 'AM', endHour: '', endMinute: '', endAmPm: 'AM' });
    setBulkSelectedTemplate(null);
    setBulkOverlapResults([]);
    setShowBulkOverlapDialog(false);
    setBulkShiftMode('existing');
  };

  const handleBulkAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedEmployeeIds.size === 0) return;

    setIsBulkAssigning(true);
    try {
      const db = getFirestore();
      const startTime24 = bulkShiftMode === 'existing' && bulkSelectedTemplate
        ? bulkSelectedTemplate.startTime
        : to24Hour(bulkShiftForm.startHour, bulkShiftForm.startMinute, bulkShiftForm.startAmPm);
      const endTime24 = bulkShiftMode === 'existing' && bulkSelectedTemplate
        ? bulkSelectedTemplate.endTime
        : to24Hour(bulkShiftForm.endHour, bulkShiftForm.endMinute, bulkShiftForm.endAmPm);
      const newShift = { fromDate: bulkShiftForm.fromDate, toDate: bulkShiftForm.toDate, startTime: startTime24, endTime: endTime24 };

      const shiftsRef = collection(db, 'shifts');
      const selectedEmps = Array.from(selectedEmployeeIds).map((id) => employees.find((e) => e.id === id)).filter(Boolean) as Employee[];

      // Overlap check against new model (employees array in each doc)
      const allShiftSnap = await getDocs(query(shiftsRef));
      const allShiftDocs: any[] = [];
      allShiftSnap.forEach((d) => allShiftDocs.push({ id: d.id, ...d.data() }));
      const overlapResults: { employee: Employee; overlaps: any[] }[] = [];
      for (const emp of selectedEmps) {
        if (!emp.employeeCode) continue;
        const docsWithEmp = allShiftDocs.filter((s) => (s.employees ?? []).some((em: any) => em.employeeCode === emp.employeeCode));
        const overlaps = findOverlappingShifts(newShift, docsWithEmp);
        if (overlaps.length > 0) overlapResults.push({ employee: emp, overlaps });
      }
      if (overlapResults.length > 0) {
        setBulkOverlapResults(overlapResults);
        setShowBulkOverlapDialog(true);
        setIsBulkAssigning(false);
        return;
      }

      const empEntries = selectedEmps.map((e) => ({ employeeCode: e.employeeCode ?? '', employeeName: e.employeeName ?? '', fromDate: bulkShiftForm.fromDate, toDate: bulkShiftForm.toDate }));

      // Find existing doc for this exact time slot (one doc per startTime+endTime)
      const slotSnap = await getDocs(query(shiftsRef,
        where('startTime', '==', startTime24),
        where('endTime', '==', endTime24)
      ));

      if (!slotSnap.empty) {
        await updateDoc(doc(db, 'shifts', slotSnap.docs[0].id), { employees: arrayUnion(...empEntries) });
      } else {
        await addDoc(shiftsRef, { startTime: startTime24, endTime: endTime24, employees: empEntries, createdAt: serverTimestamp(), createdBy: currentUser?.uid });
      }

      setSuccessMessage(`Shift assigned to ${selectedEmployeeIds.size} employee(s) successfully`);
      setShowSuccessDialog(true);
      closeBulkAssignModal();
    } catch (error) {
      console.error('Error bulk assigning shifts:', error);
    } finally {
      setIsBulkAssigning(false);
    }
  };

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-secondary-200 bg-white">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/attendance')}
            className="p-1.5 rounded-lg text-secondary-500 hover:text-secondary-900 hover:bg-secondary-100 transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-secondary-900">Employees</h1>
            <p className="text-sm text-secondary-500">
              View and manage employee records
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchEmployees}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-secondary-700 bg-white border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto bg-secondary-50 p-6">
        {/* Search Bar */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-2xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-400" />
            <input
              type="text"
              placeholder="Search employees by name, code, or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setBulkLeaveModalOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Umbrella size={16} />
              Add Leaves
            </button>
            <button
              onClick={() => { setBulkAssignModalOpen(true); fetchShiftTemplates(); }}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Clock size={16} />
              Assign Shifts
            </button>
          </div>
        </div>

        {/* Employees Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-secondary-300 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center mb-4">
              <Users className="w-10 h-10 text-blue-600" />
            </div>
            <h3 className="text-lg font-medium text-secondary-900 mb-2">
              {searchQuery ? 'No employees found' : 'No employees yet'}
            </h3>
            <p className="text-sm text-secondary-500 max-w-sm">
              {searchQuery
                ? 'Try adjusting your search terms'
                : 'Employee records will appear here once they are added to the system.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredEmployees.map((employee) => (
              <div
                key={employee.id}
                className="card p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start mb-3">
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                    <Users className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
                <h3 className="font-semibold text-secondary-900 mb-1">
                  {employee.employeeName || 'Unknown'}
                </h3>
                <div className="space-y-1 text-sm text-secondary-600">
                  {employee.employeeId && (
                    <p>
                      <span className="font-medium">ID:</span> {employee.employeeId}
                    </p>
                  )}
                  {employee.employeeCodeInDevice && (
                    <p>
                      <span className="font-medium">Device Code:</span> {employee.employeeCodeInDevice}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleShiftsClick(employee)}
                  className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  <Clock size={16} />
                  Shifts
                </button>
                <button
                  onClick={() => handleViewAttendanceClick(employee)}
                  className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
                >
                  <Eye size={16} />
                  View Attendance
                </button>
                <button
                  onClick={() => handleLeaveClick(employee)}
                  className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
                >
                  <Umbrella size={16} />
                  Leave / Week Off
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Stats */}
        {!loading && employees.length > 0 && (
          <div className="mt-6 text-sm text-secondary-500">
            Showing {filteredEmployees.length} of {employees.length} employees
          </div>
        )}
      </div>

      {/* Attendance Modal */}
      {attendanceModalOpen && attendanceEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-secondary-200">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center">
                  <CalendarDays size={18} className="text-green-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-secondary-900">
                    {attendanceEmployee.employeeName}
                  </h2>
                  <p className="text-xs text-secondary-500">Code: {attendanceEmployee.employeeCode}</p>
                </div>
              </div>
              <button
                onClick={closeAttendanceModal}
                className="p-1.5 rounded-lg text-secondary-500 hover:text-secondary-900 hover:bg-secondary-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Month Navigator */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-secondary-100 bg-secondary-50">
              <button
                onClick={() => handleAttendanceMonthChange(-1)}
                className="p-1.5 rounded-lg text-green-600 hover:bg-green-100 transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-sm font-semibold text-secondary-800">
                {MONTH_NAMES[attendanceMonth - 1]} {attendanceYear}
              </span>
              {(() => {
                const isAtCurrentMonth = attendanceMonth === new Date().getMonth() + 1 && attendanceYear === new Date().getFullYear();
                return (
                  <button
                    onClick={() => handleAttendanceMonthChange(1)}
                    className={`p-1.5 rounded-lg transition-colors ${isAtCurrentMonth ? 'text-secondary-300 cursor-not-allowed' : 'text-green-600 hover:bg-green-100'}`}
                    disabled={isAtCurrentMonth}
                  >
                    <ChevronRight size={18} />
                  </button>
                );
              })()}
            </div>

            {/* Attendance Records */}
            <div className="flex-1 overflow-y-auto p-4">
              {attendanceLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-7 h-7 border-2 border-secondary-300 border-t-green-600 rounded-full animate-spin" />
                </div>
              ) : groupedAttendance().length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-secondary-100 flex items-center justify-center mb-3">
                    <CalendarDays className="w-8 h-8 text-secondary-400" />
                  </div>
                  <p className="text-sm font-medium text-secondary-700">No attendance records</p>
                  <p className="text-xs text-secondary-500 mt-1">
                    No punches found for {MONTH_NAMES[attendanceMonth - 1]} {attendanceYear}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(() => {
                    const days = groupedAttendance();
                    return days.map(({ date, punches }, dayIdx) => {
                      // Check if this date also has a leave record
                      const dayLeave = attendanceLeaves.find((leave) => {
                        const dates: string[] = leave.dates ?? (leave.fromDate ? [leave.fromDate] : []);
                        return dates.includes(date);
                      });
                      return (
                    <React.Fragment key={date}>
                      <div className={`border border-secondary-200 rounded-lg overflow-hidden ${dayIdx % 2 === 0 ? 'bg-green-50' : 'bg-gray-100'}`}>
                      <div className={`flex items-center justify-between px-4 py-2 ${dayIdx % 2 === 0 ? 'bg-green-50' : 'bg-gray-100'}`}>
                        <span className="text-sm font-semibold text-secondary-800">
                          {formatDisplayDate(punches[0].logDate)}
                        </span>
                      </div>
                      <div className="divide-y divide-secondary-100">
                        {punches.map((punch, idx) => {
                          let lastIn: RawPunch | undefined = undefined;
                          if (punch.direction === 'out') {
                            lastIn = punches.slice(idx + 1).find(p => p.direction === 'in');
                            if (!lastIn && dayIdx < days.length - 1) {
                              const nextDayPunches = days[dayIdx + 1].punches;
                              lastIn = nextDayPunches.find(p => p.direction === 'in');
                            }
                          }
                          const duration = lastIn
                            ? (() => { const inD = toDate(lastIn!.logDate); const outD = toDate(punch.logDate); return inD && outD ? outD.getTime() - inD.getTime() : null; })()
                            : null;

                          let shift = findShiftForDate(date, employeeAttendanceShifts);
                          if (punch.direction === 'out' && !shift) {
                            const prevDate = new Date(date);
                            prevDate.setDate(prevDate.getDate() - 1);
                            const prevDateStr = prevDate.toISOString().split('T')[0];
                            shift = findShiftForDate(prevDateStr, employeeAttendanceShifts);
                          }

                          const punchMinutes = getPunchTimeInMinutes(punch.logDate);
                          let shiftIndicator: React.ReactNode = null;
                          if (shift && punchMinutes !== null) {
                            if (punch.direction === 'in') {
                              const shiftStart = getShiftTimeInMinutes(shift.startTime);
                              const diff = punchMinutes - shiftStart;
                              if (diff > 0) {
                                shiftIndicator = <span className="text-xs text-red-500 font-medium">Late by {formatMinutesDiff(diff)}</span>;
                              }
                              // Removed "Early by" for IN punches
                            } else if (punch.direction === 'out') {
                              const shiftEnd = getShiftTimeInMinutes(shift.endTime);
                              const diff = shiftEnd - punchMinutes;
                              if (diff > 0) {
                                shiftIndicator = <span className="text-xs text-orange-500 font-medium">Early out by {formatMinutesDiff(diff)}</span>;
                              }
                              // Removed "Late out by" for OUT punches
                            }
                          }

                          return (
                          <div key={punch.id} className={`flex items-center justify-between px-4 py-2 ${dayIdx % 2 === 0 ? 'bg-green-50' : 'bg-gray-100'}`}>
                            <div className="flex flex-wrap items-center gap-2 w-32">
                              {punch.direction === 'in' ? (
                                <span className="flex items-center gap-1 text-sm font-medium text-green-700 bg-green-50 px-2 py-1 rounded-full">
                                  <LogIn size={14} /> IN
                                </span>
                              ) : punch.direction === 'out' ? (
                                <span className="flex items-center gap-1 text-sm font-medium text-red-700 bg-red-50 px-2 py-1 rounded-full">
                                  <LogOut size={14} /> OUT
                                </span>
                              ) : (
                                <span className="text-sm font-medium text-secondary-500 bg-secondary-100 px-2 py-1 rounded-full">
                                  {punch.direction || '—'}
                                </span>
                              )}
                              {shiftIndicator}
                              {duration !== null && duration > 0 && (
                                <span className="text-sm text-blue-500">Duration: {formatDuration(duration)}</span>
                              )}
                            </div>
                            <span className={`text-base font-mono ${punch.direction === 'in' ? 'text-green-600' : punch.direction === 'out' ? 'text-red-500' : 'text-secondary-700'}`}>{formatTime(punch.logDate)}</span>
                            <span className="text-sm text-secondary-400">Device {punch.deviceId ?? '—'}</span>
                          </div>
                          );
                        })}
                      </div>
                    </div>
                    {dayLeave && (
                      <div className="border border-purple-200 rounded-lg overflow-hidden bg-purple-50">
                        <div className="flex items-center justify-between px-4 py-2 bg-purple-50">
                          <span className="text-sm font-semibold text-secondary-800">{formatDisplayDate(punches[0].logDate)}</span>
                          <span className="text-xs font-medium text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">Leave</span>
                        </div>
                        <div className="px-4 py-2">
                          <p className="text-xs text-purple-700">{dayLeave.reason || 'Leave'}</p>
                        </div>
                      </div>
                    )}
                    </React.Fragment>
                    );
                    });
                  })()}
                  {/* Leave-only days (no punch records) */}
                  {(() => {
                    const leaveDateSet = new Set<string>();
                    attendanceLeaves.forEach((leave) => {
                      const dates: string[] = leave.dates ?? (leave.fromDate ? [leave.fromDate] : []);
                      dates.forEach((d) => leaveDateSet.add(d));
                    });
                    const punchDateSet = new Set(groupedAttendance().map((d) => d.date));
                    const leaveDatesWithNoPunch = Array.from(leaveDateSet)
                      .filter((d) => !punchDateSet.has(d))
                      .filter((d) => {
                        const date = new Date(d);
                        return date.getMonth() + 1 === attendanceMonth && date.getFullYear() === attendanceYear;
                      })
                      .sort((a, b) => b.localeCompare(a));
                    return leaveDatesWithNoPunch.map((dateStr) => {
                      const leave = attendanceLeaves.find((l) => (l.dates ?? [l.fromDate]).includes(dateStr));
                      const displayDate = new Date(dateStr).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
                      return (
                        <div key={`leave-${dateStr}`} className="border border-purple-200 rounded-lg overflow-hidden bg-purple-50">
                          <div className="flex items-center justify-between px-4 py-2 bg-purple-50">
                            <span className="text-sm font-semibold text-secondary-800">{displayDate}</span>
                            <span className="text-xs font-medium text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">Leave</span>
                          </div>
                          <div className="px-4 py-2">
                            <p className="text-xs text-purple-700">{leave?.reason || 'Leave'}</p>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>

            {/* Footer summary */}
            {!attendanceLoading && attendancePunches.length > 0 && (
              <div className="px-4 py-3 border-t border-secondary-200 bg-secondary-50 text-xs text-secondary-500">
                {attendancePunches.length} total punch records &bull; {groupedAttendance().length} days
              </div>
            )}
          </div>
        </div>
      )}

      {/* Shift Modal */}
      {shiftModalOpen && selectedEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl">
            <div className="flex items-center justify-between p-4 border-b border-secondary-200">
              <h2 className="text-lg font-semibold text-secondary-900">
                Shift Management
              </h2>
              <button
                onClick={closeModal}
                className="p-1.5 rounded-lg text-secondary-500 hover:text-secondary-900 hover:bg-secondary-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4">
              <p className="text-sm text-secondary-600 mb-4">
                Employee: <span className="font-medium text-secondary-900">{selectedEmployee.employeeName}</span>
              </p>
              {showAddShiftForm ? (
                <form onSubmit={handleShiftFormSubmit} className="space-y-4">
                  {/* Mode tabs */}
                  <div className="flex rounded-lg border border-secondary-200 overflow-hidden">
                    <button type="button"
                      onClick={() => { setShiftMode('existing'); setSelectedShiftTemplate(null); }}
                      className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                        shiftMode === 'existing' ? 'text-blue-700 border-b-2 border-blue-600 bg-blue-50' : 'text-secondary-500 hover:text-secondary-700'
                      }`}>
                      Existing Shift
                    </button>
                    <button type="button"
                      onClick={() => { setShiftMode('new'); setSelectedShiftTemplate(null); }}
                      className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                        shiftMode === 'new' ? 'text-blue-700 border-b-2 border-blue-600 bg-blue-50' : 'text-secondary-500 hover:text-secondary-700'
                      }`}>
                      New Shift
                    </button>
                  </div>

                  {/* Existing shift picker */}
                  {shiftMode === 'existing' && (
                    <div className="border border-secondary-300 rounded-lg p-3">
                      <label className="block text-sm font-medium text-secondary-700 mb-2">Select Shift</label>
                      {shiftTemplates.length === 0 ? (
                        <p className="text-sm text-secondary-400">No shifts available. Create one first.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {shiftTemplates.map((t, i) => {
                            const s = to12Hour(t.startTime);
                            const e = to12Hour(t.endTime);
                            const label = `${s.hour}:${s.minute} ${s.ampm} — ${e.hour}:${e.minute} ${e.ampm}`;
                            const isSelected = selectedShiftTemplate?.startTime === t.startTime && selectedShiftTemplate?.endTime === t.endTime;
                            return (
                              <button key={i} type="button"
                                onClick={() => setSelectedShiftTemplate(t)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                                  isSelected ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-700 border-blue-300 hover:bg-blue-50'
                                }`}>
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* New shift time fields */}
                  {shiftMode === 'new' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="border border-secondary-300 rounded-lg p-3">
                        <label className="block text-sm font-medium text-secondary-700 mb-2">Start Time</label>
                        <div className="flex gap-2">
                          <select value={shiftForm.startHour} onChange={(e) => setShiftForm({ ...shiftForm, startHour: e.target.value })} className="flex-1 px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                            <option value="">Hr</option>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(h => <option key={h} value={h.toString()}>{h}</option>)}
                          </select>
                          <select value={shiftForm.startMinute} onChange={(e) => setShiftForm({ ...shiftForm, startMinute: e.target.value })} className="w-20 px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                            <option value="">Min</option>
                            {['00', '15', '30', '45'].map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                          <select value={shiftForm.startAmPm} onChange={(e) => setShiftForm({ ...shiftForm, startAmPm: e.target.value })} className="w-20 px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                            <option value="AM">AM</option><option value="PM">PM</option>
                          </select>
                        </div>
                      </div>
                      <div className="border border-secondary-300 rounded-lg p-3">
                        <label className="block text-sm font-medium text-secondary-700 mb-2">End Time</label>
                        <div className="flex gap-2">
                          <select value={shiftForm.endHour} onChange={(e) => setShiftForm({ ...shiftForm, endHour: e.target.value })} className="flex-1 px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                            <option value="">Hr</option>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(h => <option key={h} value={h.toString()}>{h}</option>)}
                          </select>
                          <select value={shiftForm.endMinute} onChange={(e) => setShiftForm({ ...shiftForm, endMinute: e.target.value })} className="w-20 px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                            <option value="">Min</option>
                            {['00', '15', '30', '45'].map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                          <select value={shiftForm.endAmPm} onChange={(e) => setShiftForm({ ...shiftForm, endAmPm: e.target.value })} className="w-20 px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                            <option value="AM">AM</option><option value="PM">PM</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Date range - always shown */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="border border-secondary-300 rounded-lg p-3">
                      <label className="block text-sm font-medium text-secondary-700 mb-2">From Date</label>
                      <input type="date" value={shiftForm.fromDate} onChange={(e) => setShiftForm({ ...shiftForm, fromDate: e.target.value })} className="w-full px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                    </div>
                    <div className="border border-secondary-300 rounded-lg p-3">
                      <label className="block text-sm font-medium text-secondary-700 mb-2">To Date</label>
                      <input type="date" value={shiftForm.toDate} onChange={(e) => setShiftForm({ ...shiftForm, toDate: e.target.value })} className="w-full px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={handleShiftFormCancel} className="flex-1 px-4 py-2 text-sm font-medium text-secondary-700 bg-white border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors">Cancel</button>
                    <button
                      type="submit"
                      disabled={isSavingShift || !shiftForm.fromDate || !shiftForm.toDate || (shiftMode === 'existing' ? !selectedShiftTemplate : (!shiftForm.startHour || !shiftForm.startMinute || !shiftForm.endHour || !shiftForm.endMinute))}
                      className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isSavingShift ? (
                        <>
                          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Saving...
                        </>
                      ) : (
                        'Save Shift'
                      )}
                    </button>
                  </div>
                </form>
              ) : showViewShifts ? (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-secondary-700">Shift Records</h3>
                    <button
                      onClick={() => setShowViewShifts(false)}
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      Back
                    </button>
                  </div>
                  {shiftsLoading ? (
                    <div className="text-center py-8">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      <p className="text-sm text-secondary-500 mt-2">Loading shifts...</p>
                    </div>
                  ) : employeeShifts.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-secondary-500">No shift records found</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {employeeShifts.map((shift) => (
                        <div key={shift.id} className="border border-secondary-200 rounded-lg p-3 hover:bg-secondary-50 transition-colors">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium">
                              <span className="text-blue-600">{formatShiftDate(shift.fromDate)}</span>
                              <span className="text-black"> to </span>
                              <span className="text-blue-600">{formatShiftDate(shift.toDate)}</span>
                            </span>
                            <button
                              onClick={() => handleEditShift(shift)}
                              className="text-xs text-blue-600 hover:text-blue-700"
                            >
                              Edit
                            </button>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-green-600">Start: {formatTime12(shift.startTime)}</span>
                            <span className="text-red-500">End: {formatTime12(shift.endTime)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : showEditShiftForm ? (
                <form onSubmit={handleEditShiftSubmit} className="space-y-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-secondary-700">Edit Shift</h3>
                    <button
                      type="button"
                      onClick={() => {
                        setShowEditShiftForm(false);
                        setShowViewShifts(true);
                      }}
                      className="text-sm text-blue-600 hover:text-blue-700"
                    >
                      Back
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="border border-secondary-300 rounded-lg p-3">
                      <label className="block text-sm font-medium text-secondary-700 mb-2">From Date</label>
                      <input
                        type="date"
                        value={editShiftForm.fromDate}
                        onChange={(e) => setEditShiftForm({ ...editShiftForm, fromDate: e.target.value })}
                        className="w-full px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                    <div className="border border-secondary-300 rounded-lg p-3">
                      <label className="block text-sm font-medium text-secondary-700 mb-2">To Date</label>
                      <input
                        type="date"
                        value={editShiftForm.toDate}
                        onChange={(e) => setEditShiftForm({ ...editShiftForm, toDate: e.target.value })}
                        className="w-full px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="border border-secondary-300 rounded-lg p-3">
                      <label className="block text-sm font-medium text-secondary-700 mb-2">Start Time</label>
                      <div className="flex gap-2">
                        <select
                          value={editShiftForm.startHour}
                          onChange={(e) => setEditShiftForm({ ...editShiftForm, startHour: e.target.value })}
                          className="flex-1 px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          required
                        >
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
                            <option key={h} value={h.toString()}>{h}</option>
                          ))}
                        </select>
                        <select
                          value={editShiftForm.startMinute}
                          onChange={(e) => setEditShiftForm({ ...editShiftForm, startMinute: e.target.value })}
                          className="w-20 px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          required
                        >
                          {['00', '15', '30', '45'].map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                        <select
                          value={editShiftForm.startAmPm}
                          onChange={(e) => setEditShiftForm({ ...editShiftForm, startAmPm: e.target.value })}
                          className="w-20 px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          required
                        >
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </div>
                    </div>
                    <div className="border border-secondary-300 rounded-lg p-3">
                      <label className="block text-sm font-medium text-secondary-700 mb-2">End Time</label>
                      <div className="flex gap-2">
                        <select
                          value={editShiftForm.endHour}
                          onChange={(e) => setEditShiftForm({ ...editShiftForm, endHour: e.target.value })}
                          className="flex-1 px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          required
                        >
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
                            <option key={h} value={h.toString()}>{h}</option>
                          ))}
                        </select>
                        <select
                          value={editShiftForm.endMinute}
                          onChange={(e) => setEditShiftForm({ ...editShiftForm, endMinute: e.target.value })}
                          className="w-20 px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          required
                        >
                          {['00', '15', '30', '45'].map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                        <select
                          value={editShiftForm.endAmPm}
                          onChange={(e) => setEditShiftForm({ ...editShiftForm, endAmPm: e.target.value })}
                          className="w-20 px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          required
                        >
                          <option value="AM">AM</option>
                          <option value="PM">PM</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowEditShiftForm(false);
                        setShowViewShifts(true);
                      }}
                      className="flex-1 px-4 py-2 text-sm font-medium text-secondary-700 bg-white border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingShift}
                      className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isSavingShift ? (
                        <>
                          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Updating...
                        </>
                      ) : (
                        'Update Shift'
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-2">
                <button
                  onClick={() => handleShiftAction('view')}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg border border-secondary-200 hover:bg-secondary-50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <Eye size={20} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-secondary-900">View Shifts</p>
                    <p className="text-sm text-secondary-500">View existing shift records</p>
                  </div>
                </button>
                <button
                  onClick={() => handleShiftAction('add')}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg border border-secondary-200 hover:bg-secondary-50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                    <Plus size={20} className="text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium text-secondary-900">Add Shift</p>
                    <p className="text-sm text-secondary-500">Create a new shift assignment</p>
                  </div>
                </button>
                <button
                  onClick={() => handleShiftAction('edit')}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg border border-secondary-200 hover:bg-secondary-50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                    <Edit size={20} className="text-orange-600" />
                  </div>
                  <div>
                    <p className="font-medium text-secondary-900">Edit Shift</p>
                    <p className="text-sm text-secondary-500">Modify existing shift details</p>
                  </div>
                </button>
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
                    if (emp.employeeCodeInDevice?.startsWith('Del')) return false;
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

      {/* Bulk Assign Shifts Modal */}
      {bulkAssignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-secondary-200">
              <h2 className="text-lg font-semibold text-secondary-900">Assign Shifts</h2>
              <button
                onClick={closeBulkAssignModal}
                className="p-1.5 rounded-lg text-secondary-500 hover:text-secondary-900 hover:bg-secondary-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleBulkAssignSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
              <p className="text-sm text-secondary-600">
                Select employees and define the shift to assign to all selected employees at once.
              </p>

              <div className="border border-secondary-300 rounded-lg p-3">
                <label className="block text-sm font-medium text-secondary-700 mb-2">
                  Select Employees ({selectedEmployeeIds.size} selected)
                </label>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-400" />
                  <input
                    type="text"
                    placeholder="Search by name or code..."
                    value={bulkSearchQuery}
                    onChange={(e) => setBulkSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto space-y-2 border border-secondary-200 rounded-lg p-2">
                  {employees.filter((emp) => {
                    // Exclude employees with code starting with "Del"
                    if (emp.employeeCode?.toLowerCase().startsWith('del')) {
                      return false;
                    }
                    const searchLower = bulkSearchQuery.toLowerCase();
                    return (
                      emp.employeeName?.toLowerCase().includes(searchLower) ||
                      emp.employeeCode?.toLowerCase().includes(searchLower)
                    );
                  }).map((employee) => (
                    <label
                      key={employee.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedEmployeeIds.has(employee.id)}
                        onChange={() => toggleEmployeeSelection(employee.id)}
                        className="w-4 h-4 text-blue-600 rounded border-secondary-300 focus:ring-blue-500"
                      />
                      <div>
                        <p className="text-sm font-medium text-blue-600">{employee.employeeName || 'Unnamed'}</p>
                        <p className="text-xs text-black">{employee.employeeCode || '—'}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Shared date range — always visible */}
              <div className="grid grid-cols-2 gap-4">
                <div className="border border-secondary-300 rounded-lg p-3">
                  <label className="block text-sm font-medium text-secondary-700 mb-2">From Date</label>
                  <input type="date" value={bulkShiftForm.fromDate} onChange={(e) => setBulkShiftForm({ ...bulkShiftForm, fromDate: e.target.value })}
                    className="w-full px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                </div>
                <div className="border border-secondary-300 rounded-lg p-3">
                  <label className="block text-sm font-medium text-secondary-700 mb-2">To Date</label>
                  <input type="date" value={bulkShiftForm.toDate} onChange={(e) => setBulkShiftForm({ ...bulkShiftForm, toDate: e.target.value })}
                    className="w-full px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                </div>
              </div>

              {/* Shift mode toggle */}
              <div className="flex gap-2">
                <button type="button"
                  onClick={() => { setBulkShiftMode('existing'); setBulkShiftForm((f) => ({ ...f, startHour: '', startMinute: '', startAmPm: 'AM', endHour: '', endMinute: '', endAmPm: 'AM' })); }}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                    bulkShiftMode === 'existing' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-secondary-700 border-secondary-300 hover:bg-secondary-50'
                  }`}>
                  Use Existing Shift
                </button>
                <button type="button"
                  onClick={() => { setBulkShiftMode('new'); setBulkSelectedTemplate(null); }}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                    bulkShiftMode === 'new' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-secondary-700 border-secondary-300 hover:bg-secondary-50'
                  }`}>
                  Add New Shift
                </button>
              </div>

              {bulkShiftMode === 'existing' && shiftTemplates.length > 0 && (
                <div className="border border-secondary-300 rounded-lg p-3">
                  <div className="flex flex-wrap gap-2">
                    {shiftTemplates.map((t, i) => {
                      const s = to12Hour(t.startTime);
                      const e = to12Hour(t.endTime);
                      const label = `${s.hour}:${s.minute} ${s.ampm} — ${e.hour}:${e.minute} ${e.ampm}`;
                      const isActive = bulkSelectedTemplate?.startTime === t.startTime && bulkSelectedTemplate?.endTime === t.endTime;
                      return (
                        <button key={i} type="button"
                          onClick={() => setBulkSelectedTemplate(t)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                            isActive ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-700 border-blue-300 hover:bg-blue-50'
                          }`}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {bulkShiftMode === 'new' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="border border-secondary-300 rounded-lg p-3">
                      <label className="block text-sm font-medium text-secondary-700 mb-2">Start Time</label>
                      <div className="flex gap-2">
                        <select value={bulkShiftForm.startHour} onChange={(e) => setBulkShiftForm({ ...bulkShiftForm, startHour: e.target.value })} className="flex-1 px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                          <option value="">Hr</option>
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(h => <option key={h} value={h.toString()}>{h}</option>)}
                        </select>
                        <select value={bulkShiftForm.startMinute} onChange={(e) => setBulkShiftForm({ ...bulkShiftForm, startMinute: e.target.value })} className="w-20 px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                          <option value="">Min</option>
                          {['00', '15', '30', '45'].map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <select value={bulkShiftForm.startAmPm} onChange={(e) => setBulkShiftForm({ ...bulkShiftForm, startAmPm: e.target.value })} className="w-20 px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                          <option value="AM">AM</option><option value="PM">PM</option>
                        </select>
                      </div>
                    </div>
                    <div className="border border-secondary-300 rounded-lg p-3">
                      <label className="block text-sm font-medium text-secondary-700 mb-2">End Time</label>
                      <div className="flex gap-2">
                        <select value={bulkShiftForm.endHour} onChange={(e) => setBulkShiftForm({ ...bulkShiftForm, endHour: e.target.value })} className="flex-1 px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                          <option value="">Hr</option>
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(h => <option key={h} value={h.toString()}>{h}</option>)}
                        </select>
                        <select value={bulkShiftForm.endMinute} onChange={(e) => setBulkShiftForm({ ...bulkShiftForm, endMinute: e.target.value })} className="w-20 px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                          <option value="">Min</option>
                          {['00', '15', '30', '45'].map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <select value={bulkShiftForm.endAmPm} onChange={(e) => setBulkShiftForm({ ...bulkShiftForm, endAmPm: e.target.value })} className="w-20 px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                          <option value="AM">AM</option><option value="PM">PM</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeBulkAssignModal}
                  className="flex-1 px-4 py-2 text-sm font-medium text-secondary-700 bg-white border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isBulkAssigning || selectedEmployeeIds.size === 0 || !bulkShiftForm.fromDate || !bulkShiftForm.toDate || (bulkShiftMode === 'existing' ? !bulkSelectedTemplate : !bulkShiftForm.startHour || !bulkShiftForm.startMinute || !bulkShiftForm.endHour || !bulkShiftForm.endMinute)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isBulkAssigning ? (
                    <>
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Assigning...
                    </>
                  ) : (
                    `Assign to ${selectedEmployeeIds.size} Employee${selectedEmployeeIds.size === 1 ? '' : 's'}`
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Overlap Dialog */}
      {showOverlapDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-secondary-900">Shift Overlap Detected</h3>
                <p className="text-sm text-secondary-500">Cannot assign this shift</p>
              </div>
            </div>
            <p className="text-sm text-secondary-700 mb-4">
              This shift overlaps with the following existing shift(s):
            </p>
            <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
              {overlappingShifts.map((shift) => (
                <div key={shift.id} className="border border-red-200 rounded-lg p-3 bg-red-50">
                  <div className="text-sm font-medium text-secondary-900 mb-1">
                    {shift.fromDate} to {shift.toDate}
                  </div>
                  <div className="text-sm text-secondary-600">
                    Start: {formatTime12(shift.startTime)} · End: {formatTime12(shift.endTime)}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-sm text-secondary-700 mb-6">
              Please edit or delete the overlapping shift(s) to assign this shift.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowOverlapDialog(false)}
                className="flex-1 px-4 py-2 text-sm font-medium text-secondary-700 bg-white border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors"
              >
                Go Back
              </button>
              <button
                onClick={() => {
                  setShowOverlapDialog(false);
                  setShowAddShiftForm(false);
                  setShowEditShiftForm(false);
                  setShowViewShifts(true);
                  fetchShiftsForEmployee();
                }}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                View Shifts
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Overlap Dialog */}
      {showBulkOverlapDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[80vh] flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-secondary-900">Shift Overlap Detected</h3>
                <p className="text-sm text-secondary-500">Cannot assign to some employees</p>
              </div>
            </div>
            <p className="text-sm text-secondary-700 mb-4">
              The shift cannot be assigned to the following employees because it overlaps with existing shifts:
            </p>
            <div className="overflow-y-auto space-y-4 mb-4 flex-1">
              {bulkOverlapResults.map(({ employee, overlaps }) => (
                <div key={employee.id} className="border border-red-200 rounded-lg p-3 bg-red-50">
                  <p className="text-sm font-medium text-secondary-900 mb-2">{employee.employeeName}</p>
                  <div className="space-y-1">
                    {overlaps.map((shift) => (
                      <div key={shift.id} className="text-sm text-secondary-600">
                        <span className="text-blue-600">{formatShiftDate(shift.fromDate)}</span>
                        <span className="text-black"> to </span>
                        <span className="text-blue-600">{formatShiftDate(shift.toDate)}</span>
                        <span className="text-secondary-400"> · </span>
                        <span className="text-green-600">Start: {formatTime12(shift.startTime)}</span>
                        <span className="text-secondary-400"> · </span>
                        <span className="text-red-500">End: {formatTime12(shift.endTime)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-sm text-secondary-700 mb-6">
              Please edit or delete the overlapping shifts before assigning.
            </p>
            <button
              onClick={() => setShowBulkOverlapDialog(false)}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      )}

      {/* Leave / Week Off Modal */}
      {leaveModalOpen && leaveEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-secondary-200">
              <div>
                <h2 className="text-base font-semibold text-secondary-900">Leave / Week Off</h2>
                <p className="text-xs text-purple-600">{leaveEmployee.employeeName}</p>
              </div>
              <button
                onClick={() => setLeaveModalOpen(false)}
                className="p-1.5 rounded-lg text-secondary-500 hover:text-secondary-900 hover:bg-secondary-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-secondary-200">
              <button
                onClick={() => setLeaveTab('past')}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${leaveTab === 'past' ? 'text-purple-700 border-b-2 border-purple-600' : 'text-secondary-500 hover:text-secondary-700'}`}
              >
                Past
              </button>
              <button
                onClick={() => setLeaveTab('upcoming')}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${leaveTab === 'upcoming' ? 'text-purple-700 border-b-2 border-purple-600' : 'text-secondary-500 hover:text-secondary-700'}`}
              >
                Upcoming
              </button>
            </div>

            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {(() => {
                const today = new Date().toLocaleDateString('en-CA');
                const upcomingLeaves = employeeLeaves.filter((l) => l.toDate >= today);
                const pastLeaves = employeeLeaves.filter((l) => l.toDate < today);
                const list = leaveTab === 'upcoming' ? upcomingLeaves : pastLeaves;

                return (
                  <>
                    {leavesLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="w-6 h-6 border-2 border-secondary-300 border-t-purple-600 rounded-full animate-spin" />
                      </div>
                    ) : list.length === 0 && !showAddLeaveForm ? (
                      <p className="text-sm text-secondary-500 text-center py-6">
                        No {leaveTab} leaves found.
                      </p>
                    ) : (
                      <div className="space-y-2 mb-4">
                        {list.map((leave) => {
                          const formatDate = (d: string) => {
                            const dt = new Date(d + 'T00:00:00');
                            return dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                          };
                          const dates: string[] = leave.dates ?? (leave.fromDate ? [leave.fromDate] : []);
                          return (
                          <div key={leave.id} className="border border-secondary-200 rounded-lg p-3">
                            {editingLeave?.id === leave.id ? (
                              <form onSubmit={handleSaveEditLeave} className="space-y-2">
                                <p className="text-xs font-medium text-secondary-700 mb-1">Edit Leave Dates</p>
                                {(() => {
                                  const MONTH_NAMES_E = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                                  const DAY_HEADERS_E = ['Su','Mo','Tu','We','Th','Fr','Sa'];
                                  const firstDay = new Date(editCalendarYear, editCalendarMonth, 1).getDay();
                                  const daysInMonth = new Date(editCalendarYear, editCalendarMonth + 1, 0).getDate();
                                  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({length: daysInMonth}, (_, i) => i + 1)];
                                  while (cells.length % 7 !== 0) cells.push(null);
                                  return (
                                    <div className="border border-secondary-200 rounded-lg overflow-hidden">
                                      <div className="flex items-center justify-between px-3 py-2 bg-purple-50">
                                        <button type="button" onClick={() => { if (editCalendarMonth === 0) { setEditCalendarMonth(11); setEditCalendarYear(y => y - 1); } else setEditCalendarMonth(m => m - 1); }} className="p-1 rounded hover:bg-purple-100 text-purple-700"><ChevronLeft size={14}/></button>
                                        <span className="text-xs font-semibold text-secondary-800">{MONTH_NAMES_E[editCalendarMonth]} {editCalendarYear}</span>
                                        <button type="button" onClick={() => { if (editCalendarMonth === 11) { setEditCalendarMonth(0); setEditCalendarYear(y => y + 1); } else setEditCalendarMonth(m => m + 1); }} className="p-1 rounded hover:bg-purple-100 text-purple-700"><ChevronRight size={14}/></button>
                                      </div>
                                      <div className="grid grid-cols-7 border-b border-secondary-100">
                                        {DAY_HEADERS_E.map(d => <div key={d} className="text-center text-xs font-medium text-secondary-500 py-1">{d}</div>)}
                                      </div>
                                      <div className="grid grid-cols-7 p-1 gap-0.5">
                                        {cells.map((day, i) => {
                                          if (!day) return <div key={i} />;
                                          const dateStr = `${editCalendarYear}-${String(editCalendarMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                                          const selected = editSelectedDates.includes(dateStr);
                                          return (
                                            <button key={i} type="button" onClick={() => setEditSelectedDates(prev => selected ? prev.filter(d => d !== dateStr) : [...prev, dateStr])}
                                              className={`w-full aspect-square flex items-center justify-center text-xs rounded-full transition-colors ${
                                                selected ? 'bg-purple-600 text-white font-semibold' : 'hover:bg-purple-100 text-secondary-800'
                                              }`}>{day}</button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })()}
                                {editSelectedDates.length > 0 && (
                                  <p className="text-xs text-purple-700 font-medium">{editSelectedDates.length} date{editSelectedDates.length > 1 ? 's' : ''} selected</p>
                                )}
                                <div>
                                  <label className="block text-xs font-medium text-secondary-600 mb-1">Leave Type</label>
                                  <select value={editLeaveForm.reason} onChange={(e) => setEditLeaveForm({ reason: e.target.value })}
                                    className="w-full px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" required>
                                    <option value="">Select leave type...</option>
                                    <option value="Casual Leave">Casual Leave</option>
                                    <option value="Earned Leave">Earned Leave</option>
                                    <option value="Holiday Off">Holiday Off</option>
                                    <option value="Overtime Off">Overtime Off</option>
                                  </select>
                                </div>
                                <div className="flex gap-2">
                                  <button type="button" onClick={() => setEditingLeave(null)}
                                    className="flex-1 py-1.5 text-xs font-medium text-secondary-700 border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors">Cancel</button>
                                  <button type="submit" disabled={isSavingEditLeave}
                                    className="flex-1 py-1.5 text-xs font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-60">
                                    {isSavingEditLeave ? 'Saving...' : 'Save'}
                                  </button>
                                </div>
                              </form>
                            ) : (
                              <>
                                <div className="flex items-start justify-between mb-1 gap-2">
                                  <div className="flex flex-col gap-0.5">
                                    {dates.length > 0 ? dates.map((d: string) => (
                                      <span key={d} className="text-sm font-medium text-secondary-900">{formatDate(d)}</span>
                                    )) : (
                                      <>
                                        <span className="text-sm font-medium text-secondary-900">{formatDate(leave.fromDate)}</span>
                                        {leave.toDate !== leave.fromDate && (
                                          <span className="text-sm font-medium text-secondary-900">{formatDate(leave.toDate)}</span>
                                        )}
                                      </>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button type="button" onClick={() => handleEditLeaveClick(leave)}
                                      className="p-1.5 rounded text-blue-500 hover:text-blue-700 hover:bg-blue-50 transition-colors" title="Edit">
                                      <Edit size={16} />
                                    </button>
                                    <button type="button" onClick={() => handleDeleteLeave(leave.id)}
                                      disabled={deletingLeaveId === leave.id}
                                      className="p-1.5 rounded text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50" title="Delete">
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                </div>
                                {leave.reason && (
                                  <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mt-1 ${
                                    leave.reason === 'Casual Leave'   ? 'bg-blue-100 text-blue-700' :
                                    leave.reason === 'Earned Leave'   ? 'bg-green-100 text-green-700' :
                                    leave.reason === 'Holiday Off'    ? 'bg-orange-100 text-orange-700' :
                                    leave.reason === 'Overtime Off'   ? 'bg-rose-100 text-rose-700' :
                                    'bg-secondary-100 text-secondary-600'
                                  }`}>{leave.reason}</span>
                                )}
                              </>
                            )}
                          </div>
                        ); })}
                      </div>
                    )}

                    {showAddLeaveForm ? (
                        <form onSubmit={handleSaveLeave} className="space-y-3 border-t border-secondary-200 pt-3">
                          <p className="text-sm font-medium text-secondary-700">Select Leave Dates</p>

                          {/* Custom Calendar */}
                          {(() => {
                            const MONTH_NAMES_CAL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                            const DAY_HEADERS = ['Su','Mo','Tu','We','Th','Fr','Sa'];
                            const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
                            const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
                            const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({length: daysInMonth}, (_, i) => i + 1)];
                            while (cells.length % 7 !== 0) cells.push(null);
                            return (
                              <div className="border border-secondary-200 rounded-lg overflow-hidden">
                                <div className="flex items-center justify-between px-3 py-2 bg-purple-50">
                                  <button type="button" onClick={() => { if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear(y => y - 1); } else setCalendarMonth(m => m - 1); }} className="p-1 rounded hover:bg-purple-100 text-purple-700"><ChevronLeft size={16}/></button>
                                  <span className="text-sm font-semibold text-secondary-800">{MONTH_NAMES_CAL[calendarMonth]} {calendarYear}</span>
                                  <button type="button" onClick={() => { if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear(y => y + 1); } else setCalendarMonth(m => m + 1); }} className="p-1 rounded hover:bg-purple-100 text-purple-700"><ChevronRight size={16}/></button>
                                </div>
                                <div className="grid grid-cols-7 border-b border-secondary-100">
                                  {DAY_HEADERS.map(d => <div key={d} className="text-center text-xs font-medium text-secondary-500 py-1">{d}</div>)}
                                </div>
                                <div className="grid grid-cols-7 p-1 gap-0.5">
                                  {cells.map((day, i) => {
                                    if (!day) return <div key={i} />;
                                    const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                                    const selected = selectedLeaveDates.includes(dateStr);
                                    return (
                                      <button
                                        key={i}
                                        type="button"
                                        onClick={() => setSelectedLeaveDates(prev => selected ? prev.filter(d => d !== dateStr) : [...prev, dateStr])}
                                        className={`w-full aspect-square flex items-center justify-center text-xs rounded-full transition-colors ${
                                          selected ? 'bg-purple-600 text-white font-semibold' : 'hover:bg-purple-100 text-secondary-800'
                                        }`}
                                      >
                                        {day}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}

                          {selectedLeaveDates.length > 0 && (
                            <p className="text-xs text-purple-700 font-medium">{selectedLeaveDates.length} date{selectedLeaveDates.length > 1 ? 's' : ''} selected</p>
                          )}

                          <div>
                            <label className="block text-xs font-medium text-secondary-600 mb-1">Leave Type</label>
                            <select
                              value={leaveForm.reason}
                              onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                              className="w-full px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                              required
                            >
                              <option value="">Select leave type...</option>
                              <option value="Casual Leave">Casual Leave</option>
                              <option value="Earned Leave">Earned Leave</option>
                              <option value="Holiday Off">Holiday Off</option>
                              <option value="Overtime Off">Overtime Off</option>
                            </select>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setShowAddLeaveForm(false)}
                              className="flex-1 py-2 text-sm font-medium text-secondary-700 border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={isSavingLeave}
                              className="flex-1 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-60"
                            >
                              {isSavingLeave ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <button
                          onClick={() => setShowAddLeaveForm(true)}
                          className="w-full py-2 text-sm font-medium text-purple-700 border border-purple-300 rounded-lg hover:bg-purple-50 transition-colors"
                        >
                          + Add Leave
                        </button>
                      )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Success Dialog */}
      {showSuccessDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-secondary-900 mb-2">{successMessage}</h3>
            <p className="text-sm text-secondary-600 mb-6">
              The shift has been assigned to {selectedEmployee?.employeeName}.
            </p>
            <button
              onClick={() => setShowSuccessDialog(false)}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
