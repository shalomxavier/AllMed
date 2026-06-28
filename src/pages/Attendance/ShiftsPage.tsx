import { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw, Clock, X, Users, Plus, Pencil, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, orderBy, where, addDoc, updateDoc, doc, arrayUnion, serverTimestamp } from 'firebase/firestore';
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
const to24Hour = (hour: string, minute: string, ampm: string) => {
  let h = parseInt(hour, 10);
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${h.toString().padStart(2, '0')}:${minute}`;
};
const rangesOverlap = (s1: number, e1: number, s2: number, e2: number) => s1 < e2 && s2 < e1;
const findOverlaps = (newShift: any, existing: any[]) => {
  const nFrom = new Date(newShift.fromDate), nTo = new Date(newShift.toDate);
  const nS = timeToMinutes(newShift.startTime), nE = timeToMinutes(newShift.endTime);
  return existing.filter((s) => {
    const dateOk = nFrom <= new Date(s.toDate) && new Date(s.fromDate) <= nTo;
    return dateOk && rangesOverlap(nS, nE, timeToMinutes(s.startTime), timeToMinutes(s.endTime));
  });
};

export const ShiftsPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuthContext();
  const [slots, setSlots] = useState<ShiftSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<ShiftSlot | null>(null);

  // Assign shift modal state
  const [assignOpen, setAssignOpen] = useState(false);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [assignSelectedIds, setAssignSelectedIds] = useState<Set<string>>(new Set());
  const [assignForm, setAssignForm] = useState({ fromDate: '', toDate: '', startHour: '', startMinute: '', startAmPm: 'AM', endHour: '', endMinute: '', endAmPm: 'AM' });
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignOverlaps, setAssignOverlaps] = useState<{ name: string; overlaps: any[] }[]>([]);
  const [showOverlapDialog, setShowOverlapDialog] = useState(false);
  const [assignSuccess, setAssignSuccess] = useState(false);
  const [showSlotExistsDialog, setShowSlotExistsDialog] = useState(false);
  const [editingSlot, setEditingSlot] = useState<ShiftSlot | null>(null);
  const [addingToSlot, setAddingToSlot] = useState<ShiftSlot | null>(null);
  const [addEmpSearch, setAddEmpSearch] = useState('');

  const fetchEmployees = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'employees'), orderBy('employeeName')));
      const data: Employee[] = [];
      snap.forEach((d) => data.push({ id: d.id, ...d.data() as Omit<Employee, 'id'> }));
      setAllEmployees(data.filter((e) => !e.employeeCodeInDevice?.startsWith('Del')));
    } catch (e) { console.error(e); }
  };

  const closeAssignModal = () => {
    setAssignOpen(false);
    setAssignSelectedIds(new Set());
    setAssignForm({ fromDate: '', toDate: '', startHour: '', startMinute: '', startAmPm: 'AM', endHour: '', endMinute: '', endAmPm: 'AM' });
    setAssignOverlaps([]);
    setShowOverlapDialog(false);
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
        await updateDoc(doc(db, 'shifts', editingSlot.key), { startTime, endTime });
        setAssignSuccess(true);
        fetchShifts();
        closeAssignModal();
        return;
      }

      // ADD EMPLOYEES MODE: add selected employees to existing slot
      if (addingToSlot) {
        const empEntries = selectedEmps.map((e) => ({ employeeCode: e.employeeCode ?? '', employeeName: e.employeeName ?? '', fromDate: assignForm.fromDate, toDate: assignForm.toDate }));
        if (empEntries.length > 0) {
          await updateDoc(doc(db, 'shifts', addingToSlot.key), { employees: arrayUnion(...empEntries) });
        }
        setAssignSuccess(true);
        fetchShifts();
        closeAssignModal();
        return;
      }

      // Overlap check: for each selected employee, check if they exist in any overlapping shift doc
      if (selectedEmps.length > 0) {
        const allShiftSnap = await getDocs(query(collection(db, 'shifts')));
        const allShiftDocs: any[] = [];
        allShiftSnap.forEach((d) => allShiftDocs.push({ id: d.id, ...d.data() }));
        const overlapResults: { name: string; overlaps: any[] }[] = [];
        for (const emp of selectedEmps) {
          if (!emp.employeeCode) continue;
          const docsWithEmp = allShiftDocs.filter((s) => (s.employees ?? []).some((em: any) => em.employeeCode === emp.employeeCode));
          const overlaps = findOverlaps({ startTime, endTime }, docsWithEmp);
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
        await updateDoc(doc(db, 'shifts', slotSnap.docs[0].id), { employees: arrayUnion(...empEntries) });
      } else {
        await addDoc(collection(db, 'shifts'), {
          startTime,
          endTime,
          employees: empEntries,
          createdAt: serverTimestamp(),
          createdBy: currentUser?.uid,
        });
      }
      setAssignSuccess(true);
      fetchShifts();
      closeAssignModal();
    } catch (err) { console.error(err); }
    finally { setIsAssigning(false); }
  };

  const fetchShifts = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'shifts'));
      const snapshot = await getDocs(q);
      const results: ShiftSlot[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        const emps: ShiftEmployee[] = (data.employees ?? []).map((e: any) => ({ employeeName: e.employeeName ?? '', employeeCode: e.employeeCode ?? '' }));
        results.push({
          key: d.id,
          fromDate: data.fromDate ?? '',
          toDate: data.toDate ?? '',
          startTime: data.startTime ?? '',
          endTime: data.endTime ?? '',
          count: emps.length,
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

  useEffect(() => {
    fetchShifts();
    fetchEmployees();
  }, [currentUser]);

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
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setAssignOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors"
          >
            <Plus size={16} />
            Add Shifts
          </button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-secondary-300 border-t-orange-500 rounded-full animate-spin" />
          </div>
        ) : slots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center mb-4">
              <Clock className="w-10 h-10 text-orange-500" />
            </div>
            <h3 className="text-lg font-medium text-secondary-900 mb-2">No shifts assigned yet</h3>
            <p className="text-sm text-secondary-500 max-w-sm">Shifts will appear here once assigned to employees.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {slots.map((slot) => (
              <div key={slot.key} className="bg-white rounded-xl border border-secondary-200 px-5 py-4 flex items-center justify-between gap-4 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-4 cursor-pointer flex-1" onClick={() => setSelectedSlot(slot)}>
                  <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-orange-600">
                      {formatTime12(slot.startTime)} — {formatTime12(slot.endTime)}
                    </p>
                    <p className="text-xs text-secondary-500 mt-0.5">{slot.count} {slot.count === 1 ? 'employee' : 'employees'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setAddingToSlot(slot);
                      setAssignForm({ fromDate: '', toDate: '', startHour: '', startMinute: '', startAmPm: 'AM', endHour: '', endMinute: '', endAmPm: 'AM' });
                      setAssignSelectedIds(new Set());
                      setSelectedSlot(null);
                      setAssignOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
                  >
                    <Plus size={13} />
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
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-secondary-600 border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors"
                  >
                    <Pencil size={13} />
                    Edit
                  </button>
                </div>
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
                      {allEmployees.filter((e) => { const s = addEmpSearch.toLowerCase(); return e.employeeName?.toLowerCase().includes(s) || e.employeeCode?.toLowerCase().includes(s); }).map((emp) => (
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
                  <div>
                    <p className="text-sm font-medium text-secondary-900">{emp.employeeName || '—'}</p>
                    <p className="text-xs text-secondary-500">{emp.employeeCode || '—'}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-secondary-200">
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
                  const s = parse12(selectedSlot.startTime);
                  const e = parse12(selectedSlot.endTime);
                  setAssignForm({ fromDate: '', toDate: '', startHour: s.hour, startMinute: s.minute, startAmPm: s.ampm, endHour: e.hour, endMinute: e.minute, endAmPm: e.ampm });
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
    </div>
  );
};
