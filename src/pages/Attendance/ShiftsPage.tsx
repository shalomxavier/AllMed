import { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw, Clock, X, Users, Plus, Pencil, Search, Trash2, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { collection, getDocs, query, orderBy, where, addDoc, updateDoc, doc, arrayUnion, serverTimestamp, deleteDoc, getFirestore } from 'firebase/firestore';
import { db } from '@/firebase/firebase';
import { useAuthContext } from '@/contexts/AuthContext';

interface Employee {
  id: string;
  employeeCode?: string;
  employeeCodeInDevice?: string;
  employeeName?: string;
}

interface ShiftEmployee {
  employeeName: string;
  employeeCode: string;
  fromDate?: string;
  toDate?: string;
}

interface ShiftSlot {
  key: string;
  fromDate: string;
  toDate: string;
  startTime: string;
  endTime: string;
  count: number;
  employees: ShiftEmployee[];
}

const formatTime12 = (time24: string): string => {
  if (!time24) return '—';
  const [hStr, mStr] = time24.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr ?? '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${ampm}`;
};


const timeToMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  try { return format(parseISO(dateStr), 'dd-MMMM-yyyy'); } catch { return dateStr; }
};
const to24Hour = (hour: string, minute: string, ampm: string) => {
  let h = parseInt(hour, 10);
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${h.toString().padStart(2, '0')}:${minute}`;
};
const rangesOverlap = (s1: number, e1: number, s2: number, e2: number) => s1 < e2 && s2 < e1;
const findOverlappingShifts = (newShift: any, existingShifts: any[]) => {
  const newFrom = new Date(newShift.fromDate);
  const newTo = new Date(newShift.toDate);
  const newStart = timeToMinutes(newShift.startTime);
  const newEnd = timeToMinutes(newShift.endTime);

  return existingShifts.filter((shift) => {
    const existingStart = timeToMinutes(shift.startTime);
    const existingEnd = timeToMinutes(shift.endTime);
    if (!rangesOverlap(newStart, newEnd, existingStart, existingEnd)) return false;
    const employees: any[] = shift.employees ?? [];
    return employees.some((em) => {
      if (!em.fromDate || !em.toDate) return true;
      const existingFrom = new Date(em.fromDate);
      const existingTo = new Date(em.toDate);
      return newFrom <= existingTo && existingFrom <= newTo;
    });
  });
};

export const ShiftsPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, userData } = useAuthContext();
  const [slots, setSlots] = useState<ShiftSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<ShiftSlot | null>(null);
  const [branchOptions, setBranchOptions] = useState<{ id: string; name: string; shiftIds: string[] }[]>([]);
  const [selectedBranchFilter, setSelectedBranchFilter] = useState('');
  const [managerBranchName, setManagerBranchName] = useState<string | null>(null);

  // Assign shift modal state
  const [assignOpen, setAssignOpen] = useState(false);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [assignSelectedIds, setAssignSelectedIds] = useState<Set<string>>(new Set());
  const [assignForm, setAssignForm] = useState({ fromDate: '', toDate: '', startHour: '', startMinute: '', startAmPm: 'AM', endHour: '', endMinute: '', endAmPm: 'AM' });
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignOverlaps, setAssignOverlaps] = useState<{ name: string; overlaps: any[] }[]>([]);
  const [showOverlapDialog, setShowOverlapDialog] = useState(false);
  const [duplicateAssignments, setDuplicateAssignments] = useState<{ name: string; existing: ShiftEmployee[] }[]>([]);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [assignSuccess, setAssignSuccess] = useState(false);
  const [showSlotExistsDialog, setShowSlotExistsDialog] = useState(false);
  const [editingSlot, setEditingSlot] = useState<ShiftSlot | null>(null);
  const [addingToSlot, setAddingToSlot] = useState<ShiftSlot | null>(null);
  const [addEmpSearch, setAddEmpSearch] = useState('');
  const [deleteSlot, setDeleteSlot] = useState<ShiftSlot | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editEmployeesOpen, setEditEmployeesOpen] = useState(false);
  const [removeEditEmpConfirm, setRemoveEditEmpConfirm] = useState<{ emp: ShiftEmployee; index: number } | null>(null);
  const [removeEmpConfirm, setRemoveEmpConfirm] = useState<{ emp: ShiftEmployee; index: number } | null>(null);
  const [isRemovingEmp, setIsRemovingEmp] = useState(false);

  // Leave wizard state
  interface EmpLeaveEntry { employeeCode: string; employeeName: string; employeeId: string; fromDate: string; toDate: string; }
  interface DateLeave { date: string; type: string; }
  const [askLeavesDialog, setAskLeavesDialog] = useState(false);
  const [leaveWizardOpen, setLeaveWizardOpen] = useState(false);
  const [wizardEmployees, setWizardEmployees] = useState<EmpLeaveEntry[]>([]);
  const [wizardEmpIndex, setWizardEmpIndex] = useState(0);
  const [wizardEmpLeaves, setWizardEmpLeaves] = useState<Record<string, DateLeave[]>>({});
  const [wizardCalYear, setWizardCalYear] = useState(new Date().getFullYear());
  const [wizardCalMonth, setWizardCalMonth] = useState(new Date().getMonth());
  const [wizardShowConfirm, setWizardShowConfirm] = useState(false);
  const [wizardTooltipDate, setWizardTooltipDate] = useState<string | null>(null);
  const [wizardTooltipPos, setWizardTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [wizardMultiSelectedDates, setWizardMultiSelectedDates] = useState<string[]>([]);
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);
  const [isSavingLeaves, setIsSavingLeaves] = useState(false);
  const [justAssignedEmps, setJustAssignedEmps] = useState<{ employeeCode: string; employeeName: string; employeeId: string; fromDate: string; toDate: string; }[]>([]);
  const [changeShiftDate, setChangeShiftDate] = useState<string | null>(null);
  const [changeShiftModalOpen, setChangeShiftModalOpen] = useState(false);
  const [isSavingShiftOverride, setIsSavingShiftOverride] = useState(false);
  const [shiftChangedDates, setShiftChangedDates] = useState<Record<string, { date: string; startTime: string; endTime: string }[]>>({});

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Control' || event.key === 'Meta') setIsCtrlPressed(true);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Control' || event.key === 'Meta') setIsCtrlPressed(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const fetchEmployees = async () => {
    try {
      let allowedEmployeeIds: string[] | null = null;
      
      // If user is Branch Manager, fetch the branch(es) they manage
      if (userData?.designation === 'Branch Manager' && currentUser) {
        try {
          const branchQuery = query(collection(db, 'branches'), where('managerId', '==', currentUser.uid));
          const branchSnapshot = await getDocs(branchQuery);
          if (!branchSnapshot.empty) {
            const branchData = branchSnapshot.docs[0].data();
            allowedEmployeeIds = branchData.employeeIds || [];
          } else {
            allowedEmployeeIds = [];
          }
        } catch (err) {
          console.error('Error fetching branch employees:', err);
        }
      }

      const snap = await getDocs(query(collection(db, 'employees'), orderBy('employeeName')));
      const data: Employee[] = [];
      snap.forEach((d) => data.push({ id: d.id, ...d.data() as Omit<Employee, 'id'> }));
      let filtered = data.filter((e) => !e.employeeCodeInDevice?.startsWith('Del'));
      
      // Filter by branch if allowedEmployeeIds is set
      if (allowedEmployeeIds) {
        filtered = filtered.filter((e) => allowedEmployeeIds.includes(e.id));
      }
      
      setAllEmployees(filtered);
    } catch (e) { console.error(e); }
  };

  const closeAssignModal = () => {
    setAssignOpen(false);
    setAssignSelectedIds(new Set());
    setAssignForm({ fromDate: '', toDate: '', startHour: '', startMinute: '', startAmPm: 'AM', endHour: '', endMinute: '', endAmPm: 'AM' });
    setAssignOverlaps([]);
    setShowOverlapDialog(false);
    setDuplicateAssignments([]);
    setShowDuplicateDialog(false);
    setAssignSuccess(false);
    setEditingSlot(null);
    setAddingToSlot(null);
    setAddEmpSearch('');
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAssigning(true);
    try {
      const startTime = to24Hour(assignForm.startHour, assignForm.startMinute, assignForm.startAmPm);
      const endTime = to24Hour(assignForm.endHour, assignForm.endMinute, assignForm.endAmPm);
      const selectedEmps = Array.from(assignSelectedIds).map((id) => allEmployees.find((e) => e.id === id)).filter(Boolean) as Employee[];

      // EDIT MODE: update existing slot's startTime/endTime
      if (editingSlot) {
        const allShiftSnap = await getDocs(query(collection(db, 'shifts')));
        const allShiftDocs: any[] = [];
        allShiftSnap.forEach((d) => { if (d.id !== editingSlot.key) allShiftDocs.push({ id: d.id, ...d.data() }); });

        const overlapResults: { name: string; overlaps: any[] }[] = [];
        for (const emp of editingSlot.employees) {
          if (!emp.employeeCode) continue;
          const docsWithEmp = allShiftDocs.filter((s) => (s.employees ?? []).some((em: any) => em.employeeCode === emp.employeeCode));
          const overlaps = findOverlappingShifts({ fromDate: emp.fromDate, toDate: emp.toDate, startTime, endTime }, docsWithEmp);
          if (overlaps.length > 0) overlapResults.push({ name: emp.employeeName ?? emp.employeeCode ?? '', overlaps });
        }
        if (overlapResults.length > 0) { setAssignOverlaps(overlapResults); setShowOverlapDialog(true); setIsAssigning(false); return; }

        await updateDoc(doc(db, 'shifts', editingSlot.key), {
          startTime,
          endTime,
        });
        setAssignSuccess(true);
        fetchShifts();
        closeAssignModal();
        return;
      }

      // ADD EMPLOYEES MODE: add selected employees to existing slot
      if (addingToSlot) {
        const empEntries = selectedEmps.map((e) => ({ employeeCode: e.employeeCode ?? '', employeeName: e.employeeName ?? '', fromDate: assignForm.fromDate, toDate: assignForm.toDate }));

        // Duplicate check within the same slot: prevent overlapping date ranges for the same employee
        const newFrom = new Date(assignForm.fromDate);
        const newTo = new Date(assignForm.toDate);
        const duplicateResults: { name: string; existing: ShiftEmployee[] }[] = [];
        for (const emp of selectedEmps) {
          if (!emp.employeeCode) continue;
          const existingEntries = addingToSlot.employees.filter((e) => e.employeeCode === emp.employeeCode);
          const overlapping = existingEntries.filter((e) => {
            if (!e.fromDate || !e.toDate) return true;
            const existingFrom = new Date(e.fromDate);
            const existingTo = new Date(e.toDate);
            return newFrom <= existingTo && existingFrom <= newTo;
          });
          if (overlapping.length > 0) duplicateResults.push({ name: emp.employeeName ?? emp.employeeCode ?? '', existing: overlapping });
        }
        if (duplicateResults.length > 0) {
          setDuplicateAssignments(duplicateResults);
          setShowDuplicateDialog(true);
          setIsAssigning(false);
          return;
        }

        // Overlap check: exclude the current slot being added to
        const allShiftSnap = await getDocs(query(collection(db, 'shifts')));
        const allShiftDocs: any[] = [];
        allShiftSnap.forEach((d) => { if (d.id !== addingToSlot.key) allShiftDocs.push({ id: d.id, ...d.data() }); });

        const overlapResults: { name: string; overlaps: any[] }[] = [];
        for (const emp of selectedEmps) {
          if (!emp.employeeCode) continue;
          const docsWithEmp = allShiftDocs.filter((s) => (s.employees ?? []).some((em: any) => em.employeeCode === emp.employeeCode));
          const overlaps = findOverlappingShifts({ fromDate: assignForm.fromDate, toDate: assignForm.toDate, startTime: addingToSlot.startTime, endTime: addingToSlot.endTime }, docsWithEmp);
          if (overlaps.length > 0) overlapResults.push({ name: emp.employeeName ?? emp.employeeCode ?? '', overlaps });
        }
        if (overlapResults.length > 0) { setAssignOverlaps(overlapResults); setShowOverlapDialog(true); setIsAssigning(false); return; }

        if (empEntries.length > 0) {
          await updateDoc(doc(db, 'shifts', addingToSlot.key), { employees: arrayUnion(...empEntries) });
        }
        const empsForWizard = selectedEmps.map(e => ({ employeeCode: e.employeeCode ?? '', employeeName: e.employeeName ?? '', employeeId: e.employeeCodeInDevice ?? e.employeeCode ?? '', fromDate: assignForm.fromDate, toDate: assignForm.toDate }));
        setJustAssignedEmps(empsForWizard);
        fetchShifts();
        closeAssignModal();
        if (empsForWizard.length > 0) setAskLeavesDialog(true);
        return;
      }

      // Overlap check: for each selected employee, check if they exist in any overlapping shift doc
      if (selectedEmps.length > 0 && assignForm.fromDate && assignForm.toDate) {
        const allShiftSnap = await getDocs(query(collection(db, 'shifts')));
        const allShiftDocs: any[] = [];
        allShiftSnap.forEach((d) => allShiftDocs.push({ id: d.id, ...d.data() }));
        const overlapResults: { name: string; overlaps: any[] }[] = [];
        for (const emp of selectedEmps) {
          if (!emp.employeeCode) continue;
          const docsWithEmp = allShiftDocs.filter((s) => (s.employees ?? []).some((em: any) => em.employeeCode === emp.employeeCode));
          const overlaps = findOverlappingShifts({ fromDate: assignForm.fromDate, toDate: assignForm.toDate, startTime, endTime }, docsWithEmp);
          if (overlaps.length > 0) overlapResults.push({ name: emp.employeeName ?? emp.employeeCode ?? '', overlaps });
        }
        if (overlapResults.length > 0) { setAssignOverlaps(overlapResults); setShowOverlapDialog(true); setIsAssigning(false); return; }
      }

      // Check if a doc for this exact slot already exists
      const slotSnap = await getDocs(query(collection(db, 'shifts'),
        where('startTime', '==', startTime),
        where('endTime', '==', endTime)
      ));

      const empEntries = selectedEmps.map((e) => ({ employeeCode: e.employeeCode ?? '', employeeName: e.employeeName ?? '', fromDate: assignForm.fromDate, toDate: assignForm.toDate }));

      if (!slotSnap.empty) {
        // Slot already exists — if no employees to add, show duplicate warning
        if (empEntries.length === 0) {
          setShowSlotExistsDialog(true);
          setIsAssigning(false);
          return;
        }
        await updateDoc(doc(db, 'shifts', slotSnap.docs[0].id), {
          employees: arrayUnion(...empEntries),
        });
      } else {
        await addDoc(collection(db, 'shifts'), {
          startTime,
          endTime,
          employees: empEntries,
          createdAt: serverTimestamp(),
          createdBy: currentUser?.uid,
        });
      }
      const empsForWizard = selectedEmps.map(e => ({ employeeCode: e.employeeCode ?? '', employeeName: e.employeeName ?? '', employeeId: e.employeeCodeInDevice ?? e.employeeCode ?? '', fromDate: assignForm.fromDate, toDate: assignForm.toDate }));
      setJustAssignedEmps(empsForWizard);
      fetchShifts();
      closeAssignModal();
      if (empsForWizard.length > 0) setAskLeavesDialog(true);
    } catch (err) { console.error(err); }
    finally { setIsAssigning(false); }
  };

  const handleDeleteShift = async () => {
    if (!deleteSlot) return;
    
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'shifts', deleteSlot.key));
      await fetchShifts();
      setDeleteSlot(null);
    } catch (err) {
      console.error('Error deleting shift:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const fetchShifts = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      let allowedShiftIds: string[] | null = null;
      
      // If user is Branch Manager, fetch the branch(es) they manage
      if (userData?.designation === 'Branch Manager' && currentUser) {
        try {
          const branchQuery = query(collection(db, 'branches'), where('managerId', '==', currentUser.uid));
          const branchSnapshot = await getDocs(branchQuery);
          if (!branchSnapshot.empty) {
            const branchData = branchSnapshot.docs[0].data();
            allowedShiftIds = branchData.shiftIds || [];
            setManagerBranchName(branchData.name || '');
          } else {
            allowedShiftIds = [];
            setManagerBranchName('');
          }
        } catch (err) {
          console.error('Error fetching branch shifts:', err);
        }
      } else {
        // Admin/HR: load all branches for the branch filter dropdown
        try {
          const branchesSnapshot = await getDocs(collection(db, 'branches'));
          setBranchOptions(
            branchesSnapshot.docs.map((b) => ({ id: b.id, name: b.data().name || '', shiftIds: b.data().shiftIds || [] }))
          );
        } catch (err) {
          console.error('Error fetching branches list:', err);
        }
      }

      const q = query(collection(db, 'shifts'));
      const snapshot = await getDocs(q);
      const results: ShiftSlot[] = [];
      snapshot.forEach((d) => {
        // Filter by branch if allowedShiftIds is set
        if (allowedShiftIds && !allowedShiftIds.includes(d.id)) {
          return;
        }
        
        const data = d.data();
        const emps: ShiftEmployee[] = (data.employees ?? []).map((e: any) => ({ 
          employeeName: e.employeeName ?? '', 
          employeeCode: e.employeeCode ?? '',
          fromDate: e.fromDate,
          toDate: e.toDate
        }));
        results.push({
          key: d.id,
          fromDate: data.fromDate ?? '',
          toDate: data.toDate ?? '',
          startTime: data.startTime ?? '',
          endTime: data.endTime ?? '',
          count: new Set(emps.map((e) => e.employeeCode).filter(Boolean)).size,
          employees: emps,
        });
      });
      results.sort((a, b) => a.startTime.localeCompare(b.startTime));
      setSlots(results);
    } catch (err) {
      console.error('Error fetching shifts:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredSlots = selectedBranchFilter
    ? slots.filter((s) => branchOptions.find((b) => b.name === selectedBranchFilter)?.shiftIds.includes(s.key))
    : slots;

  useEffect(() => {
    if (!currentUser) return;
    fetchShifts();
    fetchEmployees();
  }, [currentUser, userData]);

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
            <h1 className="text-xl font-semibold text-secondary-900">Shifts</h1>
            <p className="text-sm text-secondary-500">Unique shift time slots</p>
          </div>
        </div>
        <button
          onClick={fetchShifts}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-secondary-700 bg-white border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto bg-secondary-50 p-6">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="w-56">
            <label className="block text-xs font-medium text-secondary-600 mb-1">Branch</label>
            <select
              value={userData?.designation === 'Branch Manager' ? (managerBranchName ?? '') : selectedBranchFilter}
              onChange={(e) => setSelectedBranchFilter(e.target.value)}
              disabled={userData?.designation === 'Branch Manager'}
              className="w-full px-3 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:bg-secondary-100 disabled:cursor-not-allowed"
            >
              {userData?.designation === 'Branch Manager' ? (
                <option value={managerBranchName ?? ''}>{managerBranchName || 'No branch assigned'}</option>
              ) : (
                <>
                  <option value="">All Branches</option>
                  {branchOptions.map((b) => (
                    <option key={b.id} value={b.name}>{b.name}</option>
                  ))}
                </>
              )}
            </select>
          </div>
          {userData?.designation !== 'Branch Manager' && (
            <button
              onClick={() => setAssignOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors"
            >
              <Plus size={16} />
              Add Shifts
            </button>
          )}
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-secondary-300 border-t-orange-500 rounded-full animate-spin" />
          </div>
        ) : filteredSlots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center mb-4">
              <Clock className="w-10 h-10 text-orange-500" />
            </div>
            <h3 className="text-lg font-medium text-secondary-900 mb-2">No shifts assigned yet</h3>
            <p className="text-sm text-secondary-500 max-w-sm">Shifts will appear here once assigned to employees.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredSlots.map((slot) => (
              <div key={slot.key} className="card relative p-5 hover:shadow-md transition-shadow flex flex-col">
                <button
                  type="button"
                  onClick={() => setSelectedSlot(slot)}
                  className="absolute top-3 right-3 p-1.5 rounded-lg text-secondary-500 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                  aria-label="View shift employees"
                  title="View employees"
                >
                  <Eye size={17} />
                </button>
                <div className="flex items-center gap-3 mb-3 cursor-pointer" onClick={() => setSelectedSlot(slot)}>
                  <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                    <Clock className="w-6 h-6 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-secondary-900 mb-1">
                      {formatTime12(slot.startTime)} — {formatTime12(slot.endTime)}
                    </h3>
                    <div className="text-sm text-secondary-600">
                      <span className="font-medium">Employees:</span> {slot.count}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAddingToSlot(slot);
                    setAssignForm({ fromDate: '', toDate: '', startHour: '', startMinute: '', startAmPm: 'AM', endHour: '', endMinute: '', endAmPm: 'AM' });
                    setAssignSelectedIds(new Set());
                    setSelectedSlot(null);
                    setAssignOpen(true);
                  }}
                  className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  <Plus size={16} />
                  Add Employees
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const parse12 = (t: string) => {
                      const [hStr, mStr] = t.split(':');
                      const h = parseInt(hStr, 10);
                      const ampm = h >= 12 ? 'PM' : 'AM';
                      const h12 = h % 12 === 0 ? 12 : h % 12;
                      return { hour: h12.toString(), minute: mStr ?? '00', ampm };
                    };
                    const s = parse12(slot.startTime);
                    const e = parse12(slot.endTime);
                    setAssignForm({ fromDate: '', toDate: '', startHour: s.hour, startMinute: s.minute, startAmPm: s.ampm, endHour: e.hour, endMinute: e.minute, endAmPm: e.ampm });
                    setEditingSlot(slot);
                    setAssignOpen(true);
                  }}
                  className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-violet-700 bg-violet-50 rounded-lg hover:bg-violet-100 transition-colors"
                >
                  <Pencil size={16} />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteSlot(slot)}
                  className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                >
                  <Trash2 size={16} />
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assign Shifts Modal */}
      {assignOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-secondary-200">
              <h2 className="text-lg font-semibold text-secondary-900">{editingSlot ? 'Edit Shift' : 'Assign Shifts'}</h2>
              <button onClick={closeAssignModal} className="p-1.5 rounded-lg text-secondary-500 hover:text-secondary-900 hover:bg-secondary-100 transition-colors"><X size={20} /></button>
            </div>
            <form onSubmit={handleAssignSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
              {editingSlot && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setEditEmployeesOpen(true);
                      setAssignOpen(false);
                    }}
                    className="flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-900 transition-colors"
                  >
                    <Pencil size={14} />
                    Edit Employees
                  </button>
                </div>
              )}

              {addingToSlot ? (
                /* ADD EMPLOYEES MODE: show read-only time + employee picker + dates */
                <>
                  <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg">
                    <Clock className="w-4 h-4 text-orange-600 shrink-0" />
                    <span className="text-sm font-medium text-orange-700">{formatTime12(addingToSlot.startTime)} — {formatTime12(addingToSlot.endTime)}</span>
                  </div>

                  <div className="border border-secondary-300 rounded-lg p-3">
                    <label className="block text-sm font-medium text-secondary-700 mb-2">
                      Select Employees {assignSelectedIds.size > 0 && <span className="text-blue-600">({assignSelectedIds.size} selected)</span>}
                    </label>
                    <div className="relative mb-3">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-400" />
                      <input type="text" placeholder="Search by name or code..." value={addEmpSearch} onChange={(e) => setAddEmpSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                    </div>
                    <div className="max-h-52 overflow-y-auto space-y-1 border border-secondary-200 rounded-lg p-2">
                      {allEmployees.filter((e) => {
                        const search = addEmpSearch.toLowerCase();
                        return e.employeeName?.toLowerCase().includes(search) || e.employeeCode?.toLowerCase().includes(search);
                      }).map((emp) => (
                        <label key={emp.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary-50 cursor-pointer">
                          <input type="checkbox" checked={assignSelectedIds.has(emp.id)}
                            onChange={() => setAssignSelectedIds((prev) => { const n = new Set(prev); n.has(emp.id) ? n.delete(emp.id) : n.add(emp.id); return n; })}
                            className="w-4 h-4 text-blue-600 rounded border-secondary-300 focus:ring-blue-500" />
                          <div>
                            <p className="text-sm font-medium text-blue-600">{emp.employeeName || 'Unnamed'}</p>
                            <p className="text-xs text-secondary-500">{emp.employeeCode || '—'}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {assignSelectedIds.size > 0 && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="border border-secondary-300 rounded-lg p-3">
                        <label className="block text-sm font-medium text-secondary-700 mb-2">From Date</label>
                        <input type="date" value={assignForm.fromDate} onChange={(e) => setAssignForm({ ...assignForm, fromDate: e.target.value })}
                          className="w-full px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                      </div>
                      <div className="border border-secondary-300 rounded-lg p-3">
                        <label className="block text-sm font-medium text-secondary-700 mb-2">To Date</label>
                        <input type="date" value={assignForm.toDate} onChange={(e) => setAssignForm({ ...assignForm, toDate: e.target.value })}
                          className="w-full px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={closeAssignModal} className="flex-1 px-4 py-2 text-sm font-medium text-secondary-700 bg-white border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors">Cancel</button>
                    <button type="submit"
                      disabled={isAssigning || assignSelectedIds.size === 0 || !assignForm.fromDate || !assignForm.toDate}
                      className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                      {isAssigning ? 'Saving...' : `Assign ${assignSelectedIds.size > 0 ? assignSelectedIds.size : ''} Employee${assignSelectedIds.size === 1 ? '' : 's'}`}
                    </button>
                  </div>
                </>
              ) : (
                /* ADD / EDIT SHIFT MODE: show time selectors */
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="border border-secondary-300 rounded-lg p-3">
                      <label className="block text-sm font-medium text-secondary-700 mb-2">Start Time</label>
                      <div className="flex gap-2">
                        <select value={assignForm.startHour} onChange={(e) => setAssignForm({ ...assignForm, startHour: e.target.value })} className="flex-1 px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                          <option value="">Hr</option>
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(h => <option key={h} value={h.toString()}>{h}</option>)}
                        </select>
                        <select value={assignForm.startMinute} onChange={(e) => setAssignForm({ ...assignForm, startMinute: e.target.value })} className="w-20 px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                          <option value="">Min</option>
                          {['00','15','30','45'].map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <select value={assignForm.startAmPm} onChange={(e) => setAssignForm({ ...assignForm, startAmPm: e.target.value })} className="w-20 px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                          <option value="AM">AM</option><option value="PM">PM</option>
                        </select>
                      </div>
                    </div>
                    <div className="border border-secondary-300 rounded-lg p-3">
                      <label className="block text-sm font-medium text-secondary-700 mb-2">End Time</label>
                      <div className="flex gap-2">
                        <select value={assignForm.endHour} onChange={(e) => setAssignForm({ ...assignForm, endHour: e.target.value })} className="flex-1 px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                          <option value="">Hr</option>
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(h => <option key={h} value={h.toString()}>{h}</option>)}
                        </select>
                        <select value={assignForm.endMinute} onChange={(e) => setAssignForm({ ...assignForm, endMinute: e.target.value })} className="w-20 px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                          <option value="">Min</option>
                          {['00','15','30','45'].map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <select value={assignForm.endAmPm} onChange={(e) => setAssignForm({ ...assignForm, endAmPm: e.target.value })} className="w-20 px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required>
                          <option value="AM">AM</option><option value="PM">PM</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={closeAssignModal} className="flex-1 px-4 py-2 text-sm font-medium text-secondary-700 bg-white border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors">Cancel</button>
                    <button type="submit"
                      disabled={isAssigning || !assignForm.startHour || !assignForm.startMinute || !assignForm.endHour || !assignForm.endMinute}
                      className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                      {isAssigning ? 'Saving...' : editingSlot ? 'Update Shift' : 'Save Shift'}
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      )}

      {/* Edit Employees Modal */}
      {editEmployeesOpen && editingSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-secondary-200">
              <h2 className="text-lg font-semibold text-secondary-900">Edit Employees</h2>
              <button onClick={() => setEditEmployeesOpen(false)} className="p-1.5 rounded-lg text-secondary-500 hover:text-secondary-900 hover:bg-secondary-100 transition-colors"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="mb-4">
                <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg">
                  <Clock className="w-4 h-4 text-orange-600 shrink-0" />
                  <span className="text-sm font-medium text-orange-700">{formatTime12(editingSlot.startTime)} — {formatTime12(editingSlot.endTime)}</span>
                </div>
              </div>
              {editingSlot.employees.length === 0 ? (
                <div className="text-center py-8 text-secondary-500">
                  <Users className="w-12 h-12 mx-auto mb-2 text-secondary-300" />
                  <p>No employees assigned to this shift</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {editingSlot.employees.map((emp, idx) => (
                    <div key={`${emp.employeeCode}-${idx}`} className="flex items-center justify-between p-3 bg-secondary-50 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-secondary-900 truncate">{emp.employeeName || '—'}</p>
                        <p className="text-xs text-secondary-500">{emp.employeeCode || '—'}</p>
                        {(emp.fromDate || emp.toDate) && (
                          <p className="text-xs text-orange-600 mt-0.5">
                            {emp.fromDate && emp.toDate ? `${emp.fromDate} → ${emp.toDate}` : emp.fromDate || emp.toDate}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <button
                          type="button"
                          onClick={() => setRemoveEditEmpConfirm({ emp, index: idx })}
                          className="p-1.5 rounded-lg text-red-600 hover:bg-red-100 transition-colors"
                          title="Remove from shift"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {removeEditEmpConfirm && editingSlot && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-base font-semibold text-secondary-900 text-center mb-1">Remove from Shift</h3>
            <p className="text-sm text-secondary-600 text-center mb-1">Are you sure you want to remove</p>
            <p className="text-sm font-semibold text-secondary-900 text-center mb-1">{removeEditEmpConfirm.emp.employeeName}</p>
            <p className="text-xs text-secondary-500 text-center mb-5">{removeEditEmpConfirm.emp.employeeCode}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setRemoveEditEmpConfirm(null)}
                disabled={isRemovingEmp}
                className="flex-1 py-2 text-sm font-medium text-secondary-700 border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isRemovingEmp}
                onClick={async () => {
                  setIsRemovingEmp(true);
                  try {
                    const shiftRef = doc(db, 'shifts', editingSlot.key);
                    const updatedEmployees = editingSlot.employees.filter((_, index) => index !== removeEditEmpConfirm.index);
                    await updateDoc(shiftRef, { employees: updatedEmployees });
                    await fetchShifts();
                    setEditingSlot((slot) => slot ? { ...slot, employees: updatedEmployees, count: new Set(updatedEmployees.map((employee) => employee.employeeCode).filter(Boolean)).size } : null);
                    setRemoveEditEmpConfirm(null);
                  } catch (e) {
                    console.error('Error removing employee:', e);
                  } finally {
                    setIsRemovingEmp(false);
                  }
                }}
                className="flex-1 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60"
              >
                {isRemovingEmp ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slot Already Exists Dialog */}
      {showSlotExistsDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-4">
              <Clock className="w-7 h-7 text-orange-600" />
            </div>
            <h3 className="text-lg font-semibold text-secondary-900 mb-2">Shift Already Exists</h3>
            <p className="text-sm text-secondary-900 mb-6">A shift with this start and end time already exists. Use <span className="font-medium text-orange-600">Add Employees</span> on the existing shift to assign employees to it.</p>
            <button onClick={() => setShowSlotExistsDialog(false)} className="w-full px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors">OK</button>
          </div>
        </div>
      )}

      {/* Duplicate Assignment Dialog */}
      {showDuplicateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <Users className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-secondary-900">Duplicate Assignment</h3>
                <p className="text-sm text-secondary-500">Employee already assigned in this shift</p>
              </div>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
              {duplicateAssignments.map((r, i) => (
                <div key={i} className="border border-red-200 rounded-lg p-3 bg-red-50">
                  <p className="text-sm font-medium text-secondary-900 mb-1">{r.name}</p>
                  {r.existing.map((e, idx) => (
                    <p key={idx} className="text-xs text-secondary-600">{e.fromDate} → {e.toDate} · {formatTime12(addingToSlot?.startTime ?? '')} – {formatTime12(addingToSlot?.endTime ?? '')}</p>
                  ))}
                </div>
              ))}
            </div>
            <p className="text-sm text-secondary-700 mb-4">
              Please remove or edit the existing assignment before assigning these dates.
            </p>
            <button onClick={() => setShowDuplicateDialog(false)} className="w-full px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors">OK</button>
          </div>
        </div>
      )}

      {/* Overlap Dialog */}
      {showOverlapDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <Clock className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-secondary-900">Shift Overlap Detected</h3>
                <p className="text-sm text-secondary-500">Cannot assign this shift</p>
              </div>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
              {assignOverlaps.map((r, i) => (
                <div key={i} className="border border-red-200 rounded-lg p-3 bg-red-50">
                  <p className="text-sm font-medium text-secondary-900 mb-1">{r.name}</p>
                  {r.overlaps.map((s: any) => (
                    <p key={s.id} className="text-xs text-secondary-600">{s.fromDate} → {s.toDate} · {formatTime12(s.startTime)} – {formatTime12(s.endTime)}</p>
                  ))}
                </div>
              ))}
            </div>
            <button onClick={() => setShowOverlapDialog(false)} className="w-full px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors">OK</button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-secondary-900">Delete Shift</h3>
                <p className="text-sm text-secondary-500">This action cannot be undone</p>
              </div>
            </div>
            <div className="mb-6">
              <p className="text-sm text-secondary-900 mb-2">
                Are you sure you want to delete this shift?
              </p>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-red-900">
                  {formatTime12(deleteSlot.startTime)} — {formatTime12(deleteSlot.endTime)}
                </p>
                <p className="text-xs text-red-700 mt-1">
                  {deleteSlot.count} {deleteSlot.count === 1 ? 'employee' : 'employees'} assigned
                </p>
                {deleteSlot.employees.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-red-600 font-medium mb-1">Employees to be removed:</p>
                    <div className="space-y-1">
                      {deleteSlot.employees.slice(0, 3).map((emp, i) => (
                        <p key={i} className="text-xs text-red-600">• {emp.employeeName} ({emp.employeeCode})</p>
                      ))}
                      {deleteSlot.employees.length > 3 && (
                        <p className="text-xs text-red-600">• and {deleteSlot.employees.length - 3} more...</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteSlot(null)}
                className="flex-1 px-4 py-2 text-sm font-medium text-secondary-700 bg-white border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteShift()}
                disabled={isDeleting}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isDeleting ? 'Deleting...' : 'Delete Shift'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success toast */}
      {assignSuccess && (
        <div className="fixed bottom-6 right-6 z-50 bg-green-600 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg">
          Shifts assigned successfully!
        </div>
      )}

      {/* Employees Modal */}
      {selectedSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between p-4 border-b border-secondary-200">
              <div>
                <h2 className="text-base font-semibold text-secondary-900">{formatTime12(selectedSlot.startTime)} — {formatTime12(selectedSlot.endTime)}</h2>
                <p className="text-xs text-secondary-500 mt-0.5">{selectedSlot.count} {selectedSlot.count === 1 ? 'employee' : 'employees'}</p>
              </div>
              <button onClick={() => setSelectedSlot(null)} className="p-1.5 rounded-lg text-secondary-500 hover:text-secondary-900 hover:bg-secondary-100 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto p-3 space-y-1">
              {selectedSlot.employees.map((emp, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-secondary-50">
                  <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                    <Users size={14} className="text-orange-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-base font-medium text-secondary-900">{emp.employeeName || '—'}</p>
                    <p className="text-xs text-secondary-500">{emp.employeeCode || '—'}</p>
                    {(emp.fromDate || emp.toDate) && (
                      <p className="text-sm font-medium text-orange-600 mt-0.5">
                        {emp.fromDate && emp.toDate ? `${formatDate(emp.fromDate)} → ${formatDate(emp.toDate)}` : formatDate(emp.fromDate || emp.toDate || '')}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setRemoveEmpConfirm({ emp, index: i })}
                    className="p-1.5 rounded-lg text-red-600 hover:bg-red-100 transition-colors"
                    title="Remove from shift"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-secondary-200">
              <button
                type="button"
                onClick={() => {
                  setAddingToSlot(selectedSlot);
                  setAssignForm({ fromDate: '', toDate: '', startHour: '', startMinute: '', startAmPm: 'AM', endHour: '', endMinute: '', endAmPm: 'AM' });
                  setAssignSelectedIds(new Set());
                  setSelectedSlot(null);
                  setAssignOpen(true);
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus size={15} />
                Add Employees
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Employee Confirmation Dialog */}
      {removeEmpConfirm && selectedSlot && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-base font-semibold text-secondary-900 text-center mb-1">Remove from Shift</h3>
            <p className="text-sm text-secondary-600 text-center mb-1">Are you sure you want to remove</p>
            <p className="text-sm font-semibold text-secondary-900 text-center mb-1">{removeEmpConfirm.emp.employeeName}</p>
            <p className="text-xs text-secondary-500 text-center mb-5">{removeEmpConfirm.emp.employeeCode}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setRemoveEmpConfirm(null)}
                disabled={isRemovingEmp}
                className="flex-1 py-2 text-sm font-medium text-secondary-700 border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isRemovingEmp}
                onClick={async () => {
                  setIsRemovingEmp(true);
                  try {
                    const db = getFirestore();
                    const shiftRef = doc(db, 'shifts', selectedSlot.key);
                    const updatedEmployees = selectedSlot.employees.filter((_, idx) => idx !== removeEmpConfirm.index);
                    await updateDoc(shiftRef, { employees: updatedEmployees });
                    await fetchShifts();
                    setRemoveEmpConfirm(null);
                    setSelectedSlot(prev => prev ? { ...prev, employees: updatedEmployees } : null);
                  } catch (e) {
                    console.error('Error removing employee:', e);
                  } finally {
                    setIsRemovingEmp(false);
                  }
                }}
                className="flex-1 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60"
              >
                {isRemovingEmp ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ask Leaves Dialog */}
      {askLeavesDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
              <Clock className="w-7 h-7 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-secondary-900 mb-2">Assign Week-offs & Leaves?</h3>
            <p className="text-sm text-secondary-600 mb-6">Would you like to assign week-off and leave dates for the assigned employees?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setAskLeavesDialog(false)}
                className="flex-1 py-2 text-sm font-medium text-secondary-700 border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors"
              >
                No, Skip
              </button>
              <button
                onClick={() => {
                  setAskLeavesDialog(false);
                  if (justAssignedEmps.length === 0) return;
                  setWizardEmployees(justAssignedEmps);
                  setWizardEmpIndex(0);
                  setWizardEmpLeaves({});
                  setWizardMultiSelectedDates([]);
                  setWizardShowConfirm(false);
                  const from = justAssignedEmps[0].fromDate;
                  if (from) {
                    const d = new Date(from);
                    setWizardCalYear(d.getFullYear());
                    setWizardCalMonth(d.getMonth());
                  }
                  setLeaveWizardOpen(true);
                }}
                className="flex-1 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Yes, Assign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Wizard Modal */}
      {leaveWizardOpen && (() => {
        const emp = wizardEmployees[wizardEmpIndex];
        if (!emp) return null;

        const getLeaveColor = (type: string) => {
          const t = type.toLowerCase();
          if (t.includes('week off')) return { badge: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' };
          if (t.includes('casual')) return { badge: 'bg-green-100 text-green-700', dot: 'bg-green-500' };
          if (t.includes('earned') || t.includes('privilege')) return { badge: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-500' };
          if (t.includes('holiday') || t.includes('festival')) return { badge: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' };
          if (t.includes('overtime')) return { badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' };
          return { badge: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' };
        };

        const LEAVE_TYPES = ['Week Off', 'Casual Leave', 'Earned Leave', 'Holiday Off', 'Overtime Off'];
        const DAY_HEADERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
        const empLeaves = wizardEmpLeaves[emp.employeeCode] ?? [];
        const selectedDates = empLeaves.map(l => l.date);

        const fromDate = emp.fromDate ? new Date(emp.fromDate) : null;
        const toDate = emp.toDate ? new Date(emp.toDate) : null;
        const minYear = fromDate?.getFullYear() ?? wizardCalYear;
        const minMonth = fromDate?.getMonth() ?? wizardCalMonth;
        const maxYear = toDate?.getFullYear() ?? wizardCalYear;
        const maxMonth = toDate?.getMonth() ?? wizardCalMonth;

        const canPrevMonth = wizardCalYear > minYear || (wizardCalYear === minYear && wizardCalMonth > minMonth);
        const canNextMonth = wizardCalYear < maxYear || (wizardCalYear === maxYear && wizardCalMonth < maxMonth);

        const firstDay = new Date(wizardCalYear, wizardCalMonth, 1).getDay();
        const daysInMonth = new Date(wizardCalYear, wizardCalMonth + 1, 0).getDate();
        const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

        const isInRange = (day: number) => {
          const d = new Date(wizardCalYear, wizardCalMonth, day);
          if (fromDate && d < fromDate) return false;
          if (toDate && d > toDate) return false;
          return true;
        };

        const dateStr = (day: number) => `${wizardCalYear}-${String(wizardCalMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

        const getLeaveType = (ds: string) => empLeaves.find(l => l.date === ds)?.type ?? null;

        const monthName = new Date(wizardCalYear, wizardCalMonth, 1).toLocaleString('default', { month: 'long' });

        if (wizardShowConfirm) {
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-secondary-200">
                  <h2 className="text-lg font-semibold text-secondary-900">Confirm Leave Assignments</h2>
                  <button onClick={() => setLeaveWizardOpen(false)} className="p-1.5 rounded-lg text-secondary-500 hover:text-secondary-900 hover:bg-secondary-100 transition-colors"><X size={20} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {wizardEmployees.map(e => {
                    const leaves = wizardEmpLeaves[e.employeeCode] ?? [];
                    return (
                      <div key={e.employeeCode} className="border border-secondary-200 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                            <Users className="w-4 h-4 text-blue-600" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-secondary-900">{e.employeeName}</p>
                            <p className="text-xs text-secondary-500">{e.employeeCode}</p>
                          </div>
                        </div>
                        {leaves.length === 0 && (shiftChangedDates[e.employeeCode] ?? []).length === 0 ? (
                          <p className="text-xs text-secondary-400 italic">No leaves assigned</p>
                        ) : (
                          <div className="space-y-1">
                            {(shiftChangedDates[e.employeeCode] ?? []).map(sc => (
                              <div key={sc.date} className="flex items-center justify-between text-xs">
                                <span className="text-secondary-700 text-sm">{sc.date} <span className="text-blue-300">{new Date(sc.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' })}</span></span>
                                <span className="px-2 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700">Shift: {formatTime12(sc.startTime)} – {formatTime12(sc.endTime)}</span>
                              </div>
                            ))}
                            {leaves.map(l => (
                              <div key={l.date} className="flex items-center justify-between text-xs">
                                <span className="text-secondary-700 text-sm">{l.date} <span className="text-blue-300">{new Date(l.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' })}</span></span>
                                <span className={`px-2 py-0.5 rounded-full font-medium ${getLeaveColor(l.type).badge}`}>{l.type}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="p-4 border-t border-secondary-200 flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setWizardShowConfirm(false); setWizardEmpIndex(wizardEmployees.length - 1); }}
                    className="flex-1 py-2 text-sm font-medium text-secondary-700 border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={isSavingLeaves}
                    onClick={async () => {
                      setIsSavingLeaves(true);
                      try {
                        for (const e of wizardEmployees) {
                          const leaves = wizardEmpLeaves[e.employeeCode] ?? [];
                          if (leaves.length === 0) continue;
                          const empSnap = await getDocs(query(collection(db, 'employees'), where('employeeCode', '==', e.employeeCode)));
                          if (empSnap.empty) continue;
                          const empDocId = empSnap.docs[0].id;
                          // Group by leave type, save one doc per type with dates array
                          const byType: Record<string, string[]> = {};
                          for (const leave of leaves) {
                            if (!byType[leave.type]) byType[leave.type] = [];
                            byType[leave.type].push(leave.date);
                          }
                          for (const [type, dates] of Object.entries(byType)) {
                            const sorted = dates.sort();
                            await addDoc(collection(db, 'leaves'), {
                              type: 'leave',
                              employeeCode: e.employeeCode,
                              employeeName: e.employeeName,
                              employeeId: empDocId,
                              dates: sorted,
                              fromDate: sorted[0],
                              toDate: sorted[sorted.length - 1],
                              reason: type,
                              createdAt: serverTimestamp(),
                              createdBy: currentUser?.uid,
                            });
                          }
                        }
                        setLeaveWizardOpen(false);
                        setWizardEmployees([]);
                        setWizardEmpLeaves({});
                      } catch (err) { console.error(err); }
                      finally { setIsSavingLeaves(false); }
                    }}
                    className="flex-1 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
                  >
                    {isSavingLeaves ? 'Saving...' : 'Confirm & Save'}
                  </button>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-secondary-200">
                <div>
                  <h2 className="text-base font-semibold text-secondary-900">Assign Leaves / Week-offs</h2>
                  <p className="text-xs text-secondary-500 mt-0.5">Employee {wizardEmpIndex + 1} of {wizardEmployees.length}</p>
                </div>
                <button onClick={() => setLeaveWizardOpen(false)} className="p-1.5 rounded-lg text-secondary-500 hover:text-secondary-900 hover:bg-secondary-100 transition-colors"><X size={20} /></button>
              </div>

              <div className="p-4 border-b border-secondary-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <Users className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-secondary-900">{emp.employeeName}</p>
                    <p className="text-xs text-secondary-500">{emp.employeeCode} • {emp.fromDate} → {emp.toDate}</p>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {/* Calendar header */}
                <div className="flex items-center justify-between mb-3">
                  <button
                    type="button"
                    disabled={!canPrevMonth}
                    onClick={() => {
                      if (wizardCalMonth === 0) { setWizardCalMonth(11); setWizardCalYear(y => y - 1); }
                      else setWizardCalMonth(m => m - 1);
                    }}
                    className="p-1 rounded hover:bg-secondary-100 text-secondary-600 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm font-semibold text-secondary-900">{monthName} {wizardCalYear}</span>
                  <button
                    type="button"
                    disabled={!canNextMonth}
                    onClick={() => {
                      if (wizardCalMonth === 11) { setWizardCalMonth(0); setWizardCalYear(y => y + 1); }
                      else setWizardCalMonth(m => m + 1);
                    }}
                    className="p-1 rounded hover:bg-secondary-100 text-secondary-600 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                {/* Day headers */}
                <div className="grid grid-cols-7 mb-1">
                  {DAY_HEADERS.map(d => <div key={d} className="text-center text-xs font-medium text-secondary-400 py-1">{d}</div>)}
                </div>

                {/* Calendar grid */}
                <div className="grid grid-cols-7 gap-0.5 relative">
                  {cells.map((day, i) => {
                    if (!day) return <div key={i} />;
                    const ds = dateStr(day);
                    const inRange = isInRange(day);
                    const leaveType = getLeaveType(ds);
                    const isSelected = selectedDates.includes(ds);
                    const isTooltipOpen = wizardTooltipDate === ds;

                    return (
                      <div key={i} className="relative">
                        <button
                          type="button"
                          disabled={!inRange}
                          onClick={(e) => {
                            if (e.ctrlKey || e.metaKey) {
                              setWizardMultiSelectedDates((dates) => dates.includes(ds) ? dates.filter((date) => date !== ds) : [...dates, ds]);
                              setWizardTooltipDate(null);
                              setWizardTooltipPos(null);
                              return;
                            }
                            if (isTooltipOpen) { setWizardTooltipDate(null); setWizardTooltipPos(null); }
                            else {
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              setWizardTooltipPos({ x: rect.left, y: rect.bottom + 6 });
                              setWizardTooltipDate(ds);
                            }
                          }}
                          className={`w-full aspect-square flex items-center justify-center text-xs rounded-full transition-colors
                            ${!inRange ? 'text-secondary-200 cursor-not-allowed' :
                              wizardMultiSelectedDates.includes(ds) ? 'bg-blue-600 text-white font-semibold ring-2 ring-blue-300' :
                              (shiftChangedDates[emp.employeeCode] ?? []).some(sc => sc.date === ds) ? 'bg-orange-500 text-white font-semibold' :
                              isSelected ? `${getLeaveColor(leaveType ?? '').dot} text-white font-semibold` :
                              'hover:bg-secondary-100 text-secondary-800'}`}
                          title={(shiftChangedDates[emp.employeeCode] ?? []).some(sc => sc.date === ds) ? 'Shift Changed' : leaveType ?? undefined}
                        >
                          {day}
                        </button>
                        {/* Tooltip popover */}
                        {isTooltipOpen && wizardTooltipPos && (
                          <>
                            <div className="fixed inset-0 z-[99]" onClick={() => { setWizardTooltipDate(null); setWizardTooltipPos(null); }} />
                          <div className="fixed z-[100] bg-white border border-secondary-200 rounded-lg shadow-lg p-2 w-48"
                              style={{ top: wizardTooltipPos.y, left: Math.min(wizardTooltipPos.x, window.innerWidth - 200) }}>
                            {LEAVE_TYPES.map(lt => (
                              <button
                                key={lt}
                                type="button"
                                onClick={() => {
                                  setWizardEmpLeaves(prev => {
                                    const curr = prev[emp.employeeCode] ?? [];
                                    const filtered = curr.filter(l => l.date !== ds);
                                    return { ...prev, [emp.employeeCode]: [...filtered, { date: ds, type: lt }] };
                                  });
                                  setWizardTooltipDate(null); setWizardTooltipPos(null);
                                }}
                                className={`w-full text-left px-2 py-1.5 text-sm rounded transition-colors hover:opacity-80 ${leaveType === lt ? `${getLeaveColor(lt).badge} font-semibold` : 'text-secondary-700 hover:bg-secondary-50'}`}
                              >
                                {lt}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => {
                                setChangeShiftDate(ds);
                                setWizardTooltipDate(null); setWizardTooltipPos(null);
                                setChangeShiftModalOpen(true);
                              }}
                              className="w-full text-left px-2 py-1.5 text-sm rounded text-orange-600 hover:bg-orange-50 transition-colors mt-1 border-t border-secondary-100 pt-1"
                            >
                              Change Shift
                            </button>
                            {isSelected && (
                              <button
                                type="button"
                                onClick={() => {
                                  setWizardEmpLeaves(prev => ({ ...prev, [emp.employeeCode]: (prev[emp.employeeCode] ?? []).filter(l => l.date !== ds) }));
                                  setWizardTooltipDate(null); setWizardTooltipPos(null);
                                }}
                                className="w-full text-left px-2 py-1.5 text-sm rounded text-red-600 hover:bg-red-50 transition-colors mt-1 border-t border-secondary-100 pt-1"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>

                {wizardMultiSelectedDates.length > 0 && !isCtrlPressed && (
                  <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
                    <p className="text-sm font-medium text-blue-900 mb-2">Apply one leave type to {wizardMultiSelectedDates.length} selected date{wizardMultiSelectedDates.length === 1 ? '' : 's'}</p>
                    <div className="flex flex-wrap gap-2">
                      {LEAVE_TYPES.map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            setWizardEmpLeaves((prev) => {
                              const current = prev[emp.employeeCode] ?? [];
                              const remaining = current.filter((leave) => !wizardMultiSelectedDates.includes(leave.date));
                              return { ...prev, [emp.employeeCode]: [...remaining, ...wizardMultiSelectedDates.map((date) => ({ date, type }))] };
                            });
                            setWizardMultiSelectedDates([]);
                          }}
                          className="px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-white border border-blue-200 rounded-full hover:bg-blue-100 transition-colors"
                        >
                          {type}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setWizardMultiSelectedDates([])}
                        className="px-2.5 py-1.5 text-xs font-medium text-secondary-600 hover:bg-white rounded-full transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )}
                {selectedDates.length > 0 && (
                  <p className="text-xs text-purple-600 font-medium mt-3">{selectedDates.length} date{selectedDates.length > 1 ? 's' : ''} selected</p>
                )}
              </div>

              <div className="p-4 border-t border-secondary-200 flex gap-3">
                {wizardEmpIndex > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const prev = wizardEmployees[wizardEmpIndex - 1];
                      if (prev?.fromDate) {
                        const d = new Date(prev.fromDate);
                        setWizardCalYear(d.getFullYear());
                        setWizardCalMonth(d.getMonth());
                      }
                      setWizardEmpIndex(i => i - 1);
                      setWizardMultiSelectedDates([]);
                      setWizardTooltipDate(null); setWizardTooltipPos(null);
                    }}
                    className="flex-1 h-10 text-sm font-medium text-secondary-700 border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors"
                  >
                    Back
                  </button>
                )}
                {wizardEmpIndex > 0 && (
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const source = wizardEmployees.find((employee) => employee.employeeCode === e.target.value);
                      if (!source) return;
                      const copiedLeaves = (wizardEmpLeaves[source.employeeCode] ?? []).map((leave) => ({ ...leave }));
                      setWizardEmpLeaves((prev) => ({ ...prev, [emp.employeeCode]: copiedLeaves }));
                      setWizardMultiSelectedDates([]);
                      e.currentTarget.value = '';
                    }}
                    className="flex-1 min-w-0 h-10 px-3 text-center text-sm font-medium text-secondary-700 bg-white border border-secondary-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label="Copy leaves from a previous employee"
                  >
                    <option value="">Copy</option>
                    {wizardEmployees.slice(0, wizardEmpIndex).map((employee) => (
                      <option key={employee.employeeCode} value={employee.employeeCode}>{employee.employeeName}</option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setWizardTooltipDate(null); setWizardTooltipPos(null);
                    if (wizardEmpIndex < wizardEmployees.length - 1) {
                      const next = wizardEmployees[wizardEmpIndex + 1];
                      if (next?.fromDate) {
                        const d = new Date(next.fromDate);
                        setWizardCalYear(d.getFullYear());
                        setWizardCalMonth(d.getMonth());
                      }
                      setWizardEmpIndex(i => i + 1);
                      setWizardMultiSelectedDates([]);
                    } else {
                      setWizardShowConfirm(true);
                    }
                  }}
                  className="flex-1 h-10 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {wizardEmpIndex < wizardEmployees.length - 1 ? 'Next Employee' : 'Review'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Change Shift Modal */}
      {changeShiftModalOpen && changeShiftDate && (() => {
        const emp = wizardEmployees[wizardEmpIndex];
        if (!emp) return null;
        const uniqueSlots: { startTime: string; endTime: string }[] = [];
        const seen = new Set<string>();
        slots.forEach(s => {
          const key = `${s.startTime}|${s.endTime}`;
          if (!seen.has(key)) { seen.add(key); uniqueSlots.push({ startTime: s.startTime, endTime: s.endTime }); }
        });
        return (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-secondary-200">
                <div>
                  <h2 className="text-base font-semibold text-secondary-900">Change Shift</h2>
                  <p className="text-xs text-secondary-500 mt-0.5">
                    {new Date(changeShiftDate + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} &bull; {emp.employeeName}
                  </p>
                </div>
                <button onClick={() => { setChangeShiftModalOpen(false); setChangeShiftDate(null); }} className="p-1.5 rounded-lg text-secondary-500 hover:text-secondary-900 hover:bg-secondary-100 transition-colors"><X size={20} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <p className="text-sm text-secondary-600 mb-3">Select a shift to apply for this day only:</p>
                {uniqueSlots.length === 0 ? (
                  <p className="text-sm text-secondary-400 text-center py-4">No shifts available.</p>
                ) : (
                  <div className="space-y-2">
                    {uniqueSlots.map((t, i) => {
                      const label = `${formatTime12(t.startTime)} — ${formatTime12(t.endTime)}`;
                      return (
                        <button
                          key={i}
                          type="button"
                          disabled={isSavingShiftOverride}
                          onClick={async () => {
                            if (!changeShiftDate) return;
                            setIsSavingShiftOverride(true);
                            try {
                              const shiftsRef = collection(db, 'shifts');
                              const allSnap = await getDocs(query(shiftsRef));
                              const changeDate = new Date(changeShiftDate);

                              let foundDocId: string | null = null;
                              let foundEmpEntry: any = null;
                              let foundDocData: any = null;
                              allSnap.forEach((d) => {
                                const data = d.data();
                                const employees: any[] = data.employees ?? [];
                                const match = employees.find((em: any) => {
                                  if ((em.employeeCode ?? '').trim().toLowerCase() !== emp.employeeCode.trim().toLowerCase()) return false;
                                  const from = new Date(em.fromDate);
                                  const to = new Date(em.toDate);
                                  return changeDate >= from && changeDate <= to;
                                });
                                if (match && !foundDocId) {
                                  foundDocId = d.id;
                                  foundEmpEntry = match;
                                  foundDocData = data;
                                }
                              });

                              if (foundDocId && foundEmpEntry && foundDocData) {
                                const origFrom = new Date(foundEmpEntry.fromDate);
                                const origTo = new Date(foundEmpEntry.toDate);
                                const dayBefore = new Date(changeDate); dayBefore.setDate(dayBefore.getDate() - 1);
                                const dayAfter = new Date(changeDate); dayAfter.setDate(dayAfter.getDate() + 1);

                                const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

                                const updatedEmployees = (foundDocData.employees ?? []).filter((em: any) => {
                                  if ((em.employeeCode ?? '').trim().toLowerCase() !== emp.employeeCode.trim().toLowerCase()) return true;
                                  return em.fromDate !== foundEmpEntry.fromDate || em.toDate !== foundEmpEntry.toDate;
                                });

                                if (origFrom < changeDate) {
                                  updatedEmployees.push({ employeeCode: emp.employeeCode, employeeName: emp.employeeName, fromDate: foundEmpEntry.fromDate, toDate: fmt(dayBefore) });
                                }
                                if (origTo > changeDate) {
                                  updatedEmployees.push({ employeeCode: emp.employeeCode, employeeName: emp.employeeName, fromDate: fmt(dayAfter), toDate: foundEmpEntry.toDate });
                                }

                                await updateDoc(doc(db, 'shifts', foundDocId), { employees: updatedEmployees, updatedAt: serverTimestamp() });

                                const newEmpEntry = { employeeCode: emp.employeeCode, employeeName: emp.employeeName, fromDate: changeShiftDate, toDate: changeShiftDate };
                                const slotSnap = await getDocs(query(shiftsRef, where('startTime', '==', t.startTime), where('endTime', '==', t.endTime)));
                                if (!slotSnap.empty) {
                                  await updateDoc(doc(db, 'shifts', slotSnap.docs[0].id), { employees: arrayUnion(newEmpEntry) });
                                } else {
                                  await addDoc(shiftsRef, { startTime: t.startTime, endTime: t.endTime, employees: [newEmpEntry], createdAt: serverTimestamp(), createdBy: currentUser?.uid });
                                }
                              }

                              setShiftChangedDates(prev => ({
                                ...prev,
                                [emp.employeeCode]: [...(prev[emp.employeeCode] ?? []), { date: changeShiftDate, startTime: t.startTime, endTime: t.endTime }]
                              }));
                              setChangeShiftModalOpen(false);
                              setChangeShiftDate(null);
                            } catch (err) {
                              console.error('Error changing shift:', err);
                            } finally {
                              setIsSavingShiftOverride(false);
                            }
                          }}
                          className="w-full flex items-center justify-between px-4 py-3 text-left rounded-lg border border-secondary-200 hover:border-blue-400 hover:bg-blue-50 transition-colors disabled:opacity-50"
                        >
                          <div className="flex items-center gap-3">
                            <Clock size={16} className="text-blue-600" />
                            <span className="text-sm font-medium text-secondary-900">{label}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
