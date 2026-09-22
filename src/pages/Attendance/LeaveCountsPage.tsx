import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Calendar, User, Pencil, Eye, X, Trash2, Search, Plus, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getFirestore, collection, getDocs, query, orderBy, where, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useAuthContext } from '@/contexts/AuthContext';
import { RedSpinner } from '@/components/common';
import {
  findOverlappingLeaveLimits,
  formatLeaveCount,
  getLeaveUsageByType,
  normalizeLeaveEmployeeCode,
  type LeaveLimitRecord,
  type StoredLeaveRecord,
} from '@/utils/leaveLimits';

interface Employee {
  id: string;
  employeeCode?: string;
  employeeCodeInDevice?: string;
  employeeId?: string;
  employeeName?: string;
  workLocation?: string;
  designation?: string;
  department?: string;
  employmentStatus?: string;
  limits?: LeaveLimit[];
}

type LeaveRecord = StoredLeaveRecord;
type LeaveLimit = LeaveLimitRecord;

const LEAVE_TYPES = ['Week Off', 'Casual Leave', 'Earned Leave', 'Holiday Off', 'Overtime Off'];

const formatLimitDate = (date?: string): string => {
  if (!date) return '—';
  const [year, month, day] = date.split('-');
  return year && month && day ? `${day}-${month}-${year}` : date;
};

const formatDateRange = (from?: string, to?: string): string => {
  const formattedFrom = formatLimitDate(from);
  const formattedTo = formatLimitDate(to);
  if (!from || !to) return formattedFrom !== '—' ? formattedFrom : formattedTo;
  if (from === to) return formattedFrom;
  return `${formattedFrom} → ${formattedTo}`;
};

const kebabCase = (value: string): string => value.toLowerCase().replace(/\s+/g, '-');

export const LeaveCountsPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, userData } = useAuthContext();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [limits, setLimits] = useState<LeaveLimit[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingLimit, setSavingLimit] = useState(false);
  const [deletingLimit, setDeletingLimit] = useState<string | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editingLimit, setEditingLimit] = useState<LeaveLimit | null>(null);
  const [managingEmployee, setManagingEmployee] = useState<Employee | null>(null);
  const [returnToManage, setReturnToManage] = useState(false);
  const [viewingEmployee, setViewingEmployee] = useState<Employee | null>(null);
  const [limitForm, setLimitForm] = useState<{
    fromDate: string;
    toDate: string;
    limits: Record<string, string>;
  }>({ fromDate: '', toDate: '', limits: {} });
  const [limitFormError, setLimitFormError] = useState('');
  const [manageLimitError, setManageLimitError] = useState('');
  const [limitOverlapWarning, setLimitOverlapWarning] = useState('');
  const [expandedLimitId, setExpandedLimitId] = useState<string | null>(null);
  const [expandedViewLimitId, setExpandedViewLimitId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [branchesList, setBranchesList] = useState<{ id: string; name: string; employeeIds: string[] }[]>([]);
  const [branchFilter, setBranchFilter] = useState('');
  const [managerBranch, setManagerBranch] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    const fetchData = async () => {
      setLoading(true);
      try {
        const db = getFirestore();
        const [empSnap, leavesSnap, limitsSnap, branchesSnap] = await Promise.all([
          getDocs(query(collection(db, 'employees'), orderBy('employeeName'))),
          getDocs(collection(db, 'leaves')),
          getDocs(collection(db, 'leaveLimits')),
          getDocs(collection(db, 'branches')),
        ]);
        const branchesData: { id: string; name: string; employeeIds: string[] }[] = [];
        branchesSnap.forEach((d) => {
          branchesData.push({ id: d.id, name: d.data().name || '', employeeIds: d.data().employeeIds || [] });
        });

        let allowedEmployeeIds: string[] | null = null;
        let resolvedManagerBranch = '';
        if (userData?.designation === 'Branch Manager') {
          const branchSnapshot = await getDocs(query(collection(db, 'branches'), where('managerId', '==', currentUser.uid)));
          if (!branchSnapshot.empty) {
            const branchData = branchSnapshot.docs[0].data();
            allowedEmployeeIds = branchData.employeeIds || [];
            resolvedManagerBranch = branchData.name || '';
          } else {
            allowedEmployeeIds = [];
          }
        }

        const empData: Employee[] = [];
        empSnap.forEach((d) => {
          if (allowedEmployeeIds && !allowedEmployeeIds.includes(d.id)) return;
          empData.push({ id: d.id, ...d.data() } as Employee);
        });
        const leaveData: LeaveRecord[] = [];
        leavesSnap.forEach((d) => leaveData.push({ id: d.id, ...d.data() } as LeaveRecord));
        const limitData: LeaveLimit[] = [];
        limitsSnap.forEach((d) => limitData.push({ id: d.id, ...d.data() } as LeaveLimit));
        setEmployees(empData);
        setLeaves(leaveData);
        setLimits(limitData);
        setBranchesList(branchesData);
        setManagerBranch(resolvedManagerBranch || null);
        setBranchFilter(resolvedManagerBranch);
      } catch (e) {
        console.error('Error fetching leave counts data:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [currentUser, userData]);

  const canManageLimits = userData?.designation === 'Director' || userData?.designation === 'HR';

  const getEmployeeLimits = (employee?: Employee | null) => {
    const employeeCode = normalizeLeaveEmployeeCode(employee?.employeeCode);
    return limits
      .filter((limit) => normalizeLeaveEmployeeCode(limit.employeeCode) === employeeCode)
      .sort((a, b) => (a.fromDate || '').localeCompare(b.fromDate || ''));
  };

  const openAddLimit = (employee: Employee, fromManage = false) => {
    if (!canManageLimits) return;
    setEditingEmployee(employee);
    setEditingLimit(null);
    setReturnToManage(fromManage);
    setLimitForm({ fromDate: '', toDate: '', limits: {} });
    setLimitFormError('');
    setLimitOverlapWarning('');
    if (fromManage) setManagingEmployee(null);
  };

  const openViewLimits = (employee: Employee) => {
    setViewingEmployee(employee);
    setExpandedViewLimitId(null);
  };

  const openManageLimits = (employee: Employee) => {
    if (!canManageLimits) return;
    setManagingEmployee(employee);
    setManageLimitError('');
    setExpandedLimitId(null);
  };

  const openEditLimit = (employee: Employee, limit: LeaveLimit) => {
    if (!canManageLimits) return;
    const prefilledLimits: Record<string, string> = {};
    Object.entries(limit.limits || {}).forEach(([type, value]) => {
      prefilledLimits[type] = String(value);
    });
    setEditingEmployee(employee);
    setEditingLimit(limit);
    setReturnToManage(true);
    setManagingEmployee(null);
    setLimitForm({ fromDate: limit.fromDate || '', toDate: limit.toDate || '', limits: prefilledLimits });
    setLimitFormError('');
    setLimitOverlapWarning('');
  };

  const closeEditLimit = () => {
    const employee = editingEmployee;
    const shouldReturn = returnToManage;
    setEditingEmployee(null);
    setEditingLimit(null);
    setReturnToManage(false);
    setLimitForm({ fromDate: '', toDate: '', limits: {} });
    setLimitFormError('');
    setLimitOverlapWarning('');
    if (shouldReturn && employee) setManagingEmployee(employee);
  };

  const handleSaveLimit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee || !limitForm.fromDate || !limitForm.toDate) return;

    const limitsToSave: Record<string, number> = {};
    LEAVE_TYPES.forEach((type) => {
      const value = limitForm.limits[type];
      if (value === undefined || value === '') return;
      const num = Number(value);
      if (!Number.isNaN(num)) limitsToSave[type] = num;
    });

    if (limitForm.fromDate > limitForm.toDate) {
      setLimitFormError('The From date must be on or before the To date.');
      return;
    }

    setSavingLimit(true);
    setLimitFormError('');
    try {
      const db = getFirestore();
      const existingSnapshot = await getDocs(collection(db, 'leaveLimits'));
      const existingLimits: LeaveLimit[] = [];
      existingSnapshot.forEach((d) => existingLimits.push({ id: d.id, ...d.data() } as LeaveLimit));

      const overlaps = findOverlappingLeaveLimits(
        existingLimits,
        editingEmployee.employeeCode ?? '',
        limitForm.fromDate,
        limitForm.toDate,
        editingLimit?.id,
      );
      if (overlaps.length > 0) {
        const periods = overlaps.map((limit) => formatDateRange(limit.fromDate, limit.toDate)).join(', ');
        setLimitOverlapWarning(`A leave-limit period already exists for ${editingEmployee.employeeName || 'this employee'} covering ${periods}. Choose a non-overlapping date range.`);
        return;
      }

      if (editingLimit) {
        await updateDoc(doc(db, 'leaveLimits', editingLimit.id), {
          employeeCode: editingEmployee.employeeCode,
          fromDate: limitForm.fromDate,
          toDate: limitForm.toDate,
          limits: limitsToSave,
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, 'leaveLimits'), {
          employeeCode: editingEmployee.employeeCode,
          fromDate: limitForm.fromDate,
          toDate: limitForm.toDate,
          limits: limitsToSave,
          createdAt: serverTimestamp(),
        });
      }
      const snapshot = await getDocs(collection(db, 'leaveLimits'));
      const updated: LeaveLimit[] = [];
      snapshot.forEach((d) => updated.push({ id: d.id, ...d.data() } as LeaveLimit));
      setLimits(updated);
      closeEditLimit();
    } catch (err) {
      console.error('Error saving leave limit:', err);
      setLimitFormError('Unable to save this leave-limit period. Please try again.');
    } finally {
      setSavingLimit(false);
    }
  };

  const handleDeleteLimit = async (limitId: string) => {
    if (!canManageLimits || !window.confirm('Delete this leave-limit period? This action cannot be undone.')) return;
    setDeletingLimit(limitId);
    setManageLimitError('');
    try {
      const db = getFirestore();
      await deleteDoc(doc(db, 'leaveLimits', limitId));
      setLimits((prev) => prev.filter((l) => l.id !== limitId));
    } catch (err) {
      console.error('Error deleting leave limit:', err);
      setManageLimitError('Unable to delete this leave-limit period. Please try again.');
    } finally {
      setDeletingLimit(null);
    }
  };

  const employeeStats = useMemo(() => {
    const search = searchQuery.trim().toLowerCase();
    const effectiveBranch = userData?.designation === 'Branch Manager' ? (managerBranch ?? '') : branchFilter;
    const selectedBranch = effectiveBranch ? branchesList.find((branch) => branch.name === effectiveBranch) : undefined;

    return employees
      .filter((emp) => !emp.employeeCodeInDevice?.startsWith('Del'))
      .filter((emp) => emp.employmentStatus?.toLowerCase() !== 'inactive')
      .filter((emp) => !effectiveBranch || selectedBranch?.employeeIds.includes(emp.id) || emp.workLocation === effectiveBranch)
      .filter((emp) => {
        if (!search) return true;
        return (
          emp.employeeName?.toLowerCase().includes(search) ||
          emp.employeeCode?.toLowerCase().includes(search) ||
          emp.employeeId?.toLowerCase().includes(search) ||
          emp.employeeCodeInDevice?.toLowerCase().includes(search)
        );
      })
      .map((emp) => {
        const employeeCode = normalizeLeaveEmployeeCode(emp.employeeCode);
        const empLimits = limits.filter((l) => normalizeLeaveEmployeeCode(l.employeeCode) === employeeCode);
        return {
          ...emp,
          limits: empLimits,
        };
      })
      .sort((a, b) => (a.employeeName || '').localeCompare(b.employeeName || ''));
  }, [employees, limits, searchQuery, branchFilter, managerBranch, branchesList, userData?.designation]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RedSpinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-secondary-200">
        <button
          onClick={() => navigate('/attendance/leaves')}
          className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors"
        >
          <ArrowLeft size={20} className="text-secondary-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-semibold text-secondary-900">Leave Counts</h1>
          <p className="text-xs text-secondary-500">Employee-wise leave limits</p>
        </div>
      </div>

      {/* Search & Branch Filter */}
      <div className="px-4 pt-3 pb-4">
        <div className="flex items-center justify-start gap-3 flex-wrap">
          <div className="relative w-full sm:w-1/2">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400" />
            <input
              type="text"
              placeholder="Search employees by name, code, or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-secondary-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-300"
            />
          </div>
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            disabled={userData?.designation === 'Branch Manager'}
            className="w-full sm:w-56 px-3 py-2 text-sm border border-secondary-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:bg-secondary-100 disabled:cursor-not-allowed"
          >
            {userData?.designation === 'Branch Manager' ? (
              <option value={managerBranch ?? ''}>{managerBranch || 'No branch assigned'}</option>
            ) : (
              <>
                <option value="">All Locations</option>
                {branchesList.map((branch) => (
                  <option key={branch.id} value={branch.name}>{branch.name}</option>
                ))}
              </>
            )}
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3 content-start">
        {employeeStats.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mb-3">
              <Calendar className="w-8 h-8 text-purple-400" />
            </div>
            <p className="text-sm font-medium text-secondary-700">No employees found</p>
          </div>
        ) : (
          employeeStats.map((emp) => (
            <div
              key={emp.id}
              role="button"
              tabIndex={0}
              onClick={() => openViewLimits(emp)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openViewLimits(emp);
                }
              }}
              className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg p-4 flex items-center gap-3 cursor-pointer hover:shadow-xl transition-shadow"
            >
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                <User className="w-5 h-5 text-purple-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-secondary-900 truncate">{emp.employeeName || 'Unknown'}</h3>
                <p className="text-xs text-secondary-500 truncate">{emp.employeeCode || '—'}</p>
              </div>
              <div className="flex items-center gap-1">
                {canManageLimits && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); openAddLimit(emp); }}
                      className="p-1.5 rounded-lg text-secondary-500 hover:text-purple-600 hover:bg-purple-50 transition-colors"
                      aria-label="Add new limit"
                    >
                      <Plus size={16} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); openManageLimits(emp); }}
                      className="p-1.5 rounded-lg text-secondary-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      aria-label="Manage limits"
                    >
                      <Pencil size={16} />
                    </button>
                  </>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); openViewLimits(emp); }}
                  className="p-1.5 rounded-lg text-secondary-500 hover:text-teal-600 hover:bg-teal-50 transition-colors"
                  aria-label="View limits"
                >
                  <Eye size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Edit Limit Modal */}
      {editingEmployee && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closeEditLimit}>
          <div className="bg-white rounded-xl max-w-md w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-secondary-200">
              <div>
                <h2 className="text-base font-semibold text-secondary-900">{editingLimit ? 'Edit Leave Limits' : 'Add Leave Limits'}</h2>
                <p className="text-xs text-secondary-500">{editingEmployee.employeeName} · {editingEmployee.employeeCode}</p>
              </div>
              <button onClick={closeEditLimit} className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors">
                <X size={18} className="text-secondary-500" />
              </button>
            </div>
            <form onSubmit={handleSaveLimit} className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-secondary-700 mb-1">From</label>
                  <input
                    type="date"
                    required
                    value={limitForm.fromDate}
                    onChange={(e) => { setLimitFormError(''); setLimitForm((f) => ({ ...f, fromDate: e.target.value })); }}
                    className="w-full px-3 py-2 text-sm border border-secondary-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-300"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-secondary-700 mb-1">To</label>
                  <input
                    type="date"
                    required
                    value={limitForm.toDate}
                    onChange={(e) => { setLimitFormError(''); setLimitForm((f) => ({ ...f, toDate: e.target.value })); }}
                    className="w-full px-3 py-2 text-sm border border-secondary-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-300"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {LEAVE_TYPES.map((type) => (
                  <div key={type}>
                    <label htmlFor={`limit-${kebabCase(type)}`} className="block text-sm font-medium text-secondary-700 mb-1">{type}</label>
                    <input
                      id={`limit-${kebabCase(type)}`}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="0"
                      value={limitForm.limits[type] ?? ''}
                      onChange={(e) => {
                        setLimitFormError('');
                        const value = e.target.value.replace(/[^0-9]/g, '');
                        setLimitForm((f) => ({
                          ...f,
                          limits: { ...f.limits, [type]: value },
                        }));
                      }}
                      className="w-full px-3 py-2 text-sm border border-secondary-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-300"
                    />
                  </div>
                ))}
              </div>
              {limitFormError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {limitFormError}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeEditLimit}
                  className="flex-1 py-2.5 text-sm font-medium text-secondary-700 border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingLimit}
                  className="flex-1 py-2.5 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-60"
                >
                  {savingLimit ? 'Saving...' : editingLimit ? 'Update Limits' : 'Save Limits'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {limitOverlapWarning && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" onClick={() => setLimitOverlapWarning('')}>
          <div className="bg-white rounded-xl max-w-sm w-full p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 text-amber-600" />
            </div>
            <h3 className="text-lg font-semibold text-secondary-900 mb-2">Overlapping Limit Period</h3>
            <p className="text-sm text-secondary-600 mb-6">{limitOverlapWarning}</p>
            <button
              type="button"
              onClick={() => setLimitOverlapWarning('')}
              className="w-full py-2.5 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors"
            >
              Review Dates
            </button>
          </div>
        </div>
      )}

      {managingEmployee && (() => {
        const employeeLimits = getEmployeeLimits(managingEmployee);
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setManagingEmployee(null)}>
            <div className="bg-white rounded-xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-secondary-200">
                <div>
                  <h2 className="text-base font-semibold text-secondary-900">Manage Leave Limits</h2>
                  <p className="text-xs text-secondary-500">{managingEmployee.employeeName} · {managingEmployee.employeeCode}</p>
                </div>
                <button onClick={() => setManagingEmployee(null)} className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors">
                  <X size={18} className="text-secondary-500" />
                </button>
              </div>
              <div className="p-4 overflow-y-auto space-y-3">
                {manageLimitError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{manageLimitError}</div>}
                {employeeLimits.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm font-medium text-secondary-700">No limits configured</p>
                    <p className="text-xs text-secondary-500 mt-1">Add a leave/week-off limit period for this employee.</p>
                  </div>
                ) : employeeLimits.map((limit) => {
                  const isExpanded = expandedLimitId === limit.id;
                  const usage = limit.fromDate && limit.toDate
                    ? getLeaveUsageByType(managingEmployee.employeeCode || '', limit.fromDate, limit.toDate, leaves)
                    : {};
                  const totalAssigned = Object.values(limit.limits || {}).reduce((total, value) => total + (value || 0), 0);
                  const totalUsed = Object.entries(limit.limits || {}).reduce((total, [type]) => total + (usage[type] || 0), 0);
                  const totalRemaining = totalAssigned - totalUsed;
                  return (
                    <div key={limit.id} className="rounded-xl border border-secondary-200 overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2.5 bg-secondary-50 border-b border-secondary-100">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-semibold px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 whitespace-nowrap">{formatDateRange(limit.fromDate, limit.toDate)}</span>
                          <span className="text-sm font-semibold px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-red-700 whitespace-nowrap">{formatLeaveCount(totalAssigned)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => setExpandedLimitId(isExpanded ? null : limit.id)} className="p-1.5 rounded-lg text-secondary-500 hover:text-purple-600 hover:bg-purple-50" aria-label={isExpanded ? 'Collapse limit details' : 'Expand limit details'} aria-expanded={isExpanded}>
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                          <button type="button" onClick={() => openEditLimit(managingEmployee, limit)} disabled={deletingLimit === limit.id} className="p-1.5 rounded-lg text-secondary-500 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-50" aria-label="Edit limit period"><Pencil size={16} /></button>
                          <button type="button" onClick={() => handleDeleteLimit(limit.id)} disabled={deletingLimit === limit.id} className="p-1.5 rounded-lg text-secondary-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-50" aria-label="Delete limit period"><Trash2 size={16} /></button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[360px] text-sm">
                            <thead>
                              <tr className="bg-purple-50 border-b border-purple-100 text-purple-700">
                                <th className="px-3 py-2 text-left font-medium">Leave/Off</th>
                                <th className="px-3 py-2 text-center font-medium">Assigned</th>
                                <th className="px-3 py-2 text-center font-medium">Used</th>
                                <th className="px-3 py-2 text-center font-medium">Remaining</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(limit.limits || {}).map(([type, assigned]) => {
                                const used = usage[type] || 0;
                                const remaining = assigned - used;
                                return (
                                  <tr key={type} className="border-b border-secondary-100 last:border-0">
                                    <td className="px-3 py-2 font-medium text-secondary-800">{type}</td>
                                    <td className="px-3 py-2 text-center font-bold text-secondary-900">{formatLeaveCount(assigned)}</td>
                                    <td className="px-3 py-2 text-center font-bold text-secondary-900">{formatLeaveCount(used)}</td>
                                    <td className={`px-3 py-2 text-center font-bold ${remaining < 0 ? 'text-red-700' : 'text-green-700'}`}>{formatLeaveCount(remaining)}</td>
                                  </tr>
                                );
                              })}
                              <tr className="bg-purple-50 border-t border-purple-100 font-semibold">
                                <td className="px-3 py-2 text-purple-800">Total</td>
                                <td className="px-3 py-2 text-center text-purple-900">{formatLeaveCount(totalAssigned)}</td>
                                <td className="px-3 py-2 text-center text-purple-900">{formatLeaveCount(totalUsed)}</td>
                                <td className={`px-3 py-2 text-center ${totalRemaining < 0 ? 'text-red-700' : 'text-purple-900'}`}>{formatLeaveCount(totalRemaining)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="p-4 border-t border-secondary-200">
                <button type="button" onClick={() => openAddLimit(managingEmployee, true)} className="w-full inline-flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700">
                  <Plus size={16} /> Add another limit period
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* View Limits Modal */}
      {viewingEmployee && (() => {
        const employeeLimits = getEmployeeLimits(viewingEmployee);
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setViewingEmployee(null)}>
            <div className="bg-white rounded-xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-secondary-200">
                <div>
                  <h2 className="text-base font-semibold text-secondary-900">Configured Limits</h2>
                  <p className="text-xs text-secondary-500">{viewingEmployee.employeeName} · {viewingEmployee.employeeCode}</p>
                </div>
                <button onClick={() => setViewingEmployee(null)} className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors">
                  <X size={18} className="text-secondary-500" />
                </button>
              </div>
              <div className="p-4 overflow-y-auto space-y-3">
                {employeeLimits.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-sm font-medium text-secondary-700">No limits configured</p>
                    <p className="text-xs text-secondary-500 mt-1">No leave/week-off limit period has been assigned.</p>
                  </div>
                ) : employeeLimits.map((limit) => {
                  const isExpanded = expandedViewLimitId === limit.id;
                  const usage = limit.fromDate && limit.toDate
                    ? getLeaveUsageByType(viewingEmployee.employeeCode || '', limit.fromDate, limit.toDate, leaves)
                    : {};
                  const totalAssigned = Object.values(limit.limits || {}).reduce((total, value) => total + (value || 0), 0);
                  const totalUsed = Object.entries(limit.limits || {}).reduce((total, [type]) => total + (usage[type] || 0), 0);
                  const totalRemaining = totalAssigned - totalUsed;
                  return (
                    <div key={limit.id} className="rounded-xl border border-secondary-200 overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2.5 bg-secondary-50 border-b border-secondary-100">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-semibold px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 whitespace-nowrap">{formatDateRange(limit.fromDate, limit.toDate)}</span>
                          <span className="text-sm font-semibold px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-red-700 whitespace-nowrap">{formatLeaveCount(totalAssigned)}</span>
                        </div>
                        <button type="button" onClick={() => setExpandedViewLimitId(isExpanded ? null : limit.id)} className="p-1.5 rounded-lg text-secondary-500 hover:text-purple-600 hover:bg-purple-50" aria-label={isExpanded ? 'Collapse limit details' : 'Expand limit details'} aria-expanded={isExpanded}>
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[360px] text-sm">
                            <thead>
                              <tr className="bg-purple-50 border-b border-purple-100 text-purple-700">
                                <th className="px-3 py-2 text-left font-medium">Leave/Off</th>
                                <th className="px-3 py-2 text-center font-medium">Assigned</th>
                                <th className="px-3 py-2 text-center font-medium">Used</th>
                                <th className="px-3 py-2 text-center font-medium">Remaining</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Object.entries(limit.limits || {}).map(([type, assigned]) => {
                                const used = usage[type] || 0;
                                const remaining = assigned - used;
                                return (
                                  <tr key={type} className="border-b border-secondary-100 last:border-0">
                                    <td className="px-3 py-2 font-medium text-secondary-800">{type}</td>
                                    <td className="px-3 py-2 text-center font-bold text-secondary-900">{formatLeaveCount(assigned)}</td>
                                    <td className="px-3 py-2 text-center font-bold text-secondary-900">{formatLeaveCount(used)}</td>
                                    <td className={`px-3 py-2 text-center font-bold ${remaining < 0 ? 'text-red-700' : 'text-green-700'}`}>{formatLeaveCount(remaining)}</td>
                                  </tr>
                                );
                              })}
                              <tr className="bg-purple-50 border-t border-purple-100 font-semibold">
                                <td className="px-3 py-2 text-purple-800">Total</td>
                                <td className="px-3 py-2 text-center text-purple-900">{formatLeaveCount(totalAssigned)}</td>
                                <td className="px-3 py-2 text-center text-purple-900">{formatLeaveCount(totalUsed)}</td>
                                <td className={`px-3 py-2 text-center ${totalRemaining < 0 ? 'text-red-700' : 'text-purple-900'}`}>{formatLeaveCount(totalRemaining)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
