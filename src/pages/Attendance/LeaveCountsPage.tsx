import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Calendar, User, Pencil, Eye, X, Trash2, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getFirestore, collection, getDocs, query, orderBy, where, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useAuthContext } from '@/contexts/AuthContext';
import { RedSpinner } from '@/components/common';
import {
  findOverlappingLeaveLimits,
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

const formatDateRange = (from?: string, to?: string): string => {
  if (!from || !to) return from || to || '—';
  if (from === to) return from;
  return `${from} → ${to}`;
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
  const [viewingEmployee, setViewingEmployee] = useState<Employee | null>(null);
  const [limitForm, setLimitForm] = useState<{
    fromDate: string;
    toDate: string;
    limits: Record<string, string>;
  }>({ fromDate: '', toDate: '', limits: {} });
  const [limitFormError, setLimitFormError] = useState('');
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

  const openEditLimit = (employee: Employee) => {
    setEditingEmployee(employee);
    setLimitFormError('');
    const latestLimit = (employee.limits ?? [])
      .slice()
      .sort((a, b) => (b.fromDate || '').localeCompare(a.fromDate || ''))[0];
    if (latestLimit) {
      const prefilledLimits: Record<string, string> = {};
      Object.entries(latestLimit.limits || {}).forEach(([type, value]) => {
        prefilledLimits[type] = String(value);
      });
      setLimitForm({
        fromDate: latestLimit.fromDate || '',
        toDate: latestLimit.toDate || '',
        limits: prefilledLimits,
      });
    } else {
      setLimitForm({ fromDate: '', toDate: '', limits: {} });
    }
  };

  const closeEditLimit = () => {
    setEditingEmployee(null);
    setLimitForm({ fromDate: '', toDate: '', limits: {} });
    setLimitFormError('');
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
      );
      if (overlaps.length > 0) {
        const periods = overlaps.map((limit) => formatDateRange(limit.fromDate, limit.toDate)).join(', ');
        setLimitFormError(`A leave-limit period already exists for ${editingEmployee.employeeName || 'this employee'} covering ${periods}. Choose a non-overlapping date range.`);
        return;
      }

      await addDoc(collection(db, 'leaveLimits'), {
        employeeCode: editingEmployee.employeeCode,
        fromDate: limitForm.fromDate,
        toDate: limitForm.toDate,
        limits: limitsToSave,
        createdAt: serverTimestamp(),
      });
      const snapshot = await getDocs(collection(db, 'leaveLimits'));
      const updated: LeaveLimit[] = [];
      snapshot.forEach((d) => updated.push({ id: d.id, ...d.data() } as LeaveLimit));
      setLimits(updated);
      closeEditLimit();
    } catch (err) {
      console.error('Error saving leave limit:', err);
    } finally {
      setSavingLimit(false);
    }
  };

  const handleDeleteLimit = async (limitId: string) => {
    setDeletingLimit(limitId);
    try {
      const db = getFirestore();
      await deleteDoc(doc(db, 'leaveLimits', limitId));
      setLimits((prev) => prev.filter((l) => l.id !== limitId));
      setViewingEmployee((prev) => {
        if (!prev) return prev;
        return { ...prev, limits: (prev.limits ?? []).filter((l) => l.id !== limitId) };
      });
    } catch (err) {
      console.error('Error deleting leave limit:', err);
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
              onClick={() => setViewingEmployee(emp)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setViewingEmployee(emp);
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
                <button
                  onClick={(e) => { e.stopPropagation(); openEditLimit(emp); }}
                  className="p-1.5 rounded-lg text-secondary-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  aria-label="Edit limits"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setViewingEmployee(emp); }}
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
                <h2 className="text-base font-semibold text-secondary-900">Assign Leave Limits</h2>
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
                  {savingLimit ? 'Saving...' : 'Save Limits'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Limits Modal */}
      {viewingEmployee && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setViewingEmployee(null)}>
          <div className="bg-white rounded-xl max-w-md w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-secondary-200">
              <div>
                <h2 className="text-base font-semibold text-secondary-900">Configured Limits</h2>
                <p className="text-xs text-secondary-500">{viewingEmployee.employeeName} · {viewingEmployee.employeeCode}</p>
              </div>
              <button onClick={() => setViewingEmployee(null)} className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors">
                <X size={18} className="text-secondary-500" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {(viewingEmployee.limits ?? []).length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm font-medium text-secondary-700">No limits configured</p>
                  <p className="text-xs text-secondary-500 mt-1">Use the Edit option to add leave/week-off limits.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {(viewingEmployee.limits ?? [])
                    .slice()
                    .sort((a, b) => (a.fromDate || '').localeCompare(b.fromDate || ''))
                    .map((limit) => {
                      const usage = limit.fromDate && limit.toDate
                        ? getLeaveUsageByType(
                            viewingEmployee.employeeCode || '',
                            limit.fromDate,
                            limit.toDate,
                            leaves,
                          )
                        : {};
                      return (
                        <div key={limit.id} className="bg-white rounded-xl shadow-sm border border-secondary-200 overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-2.5 bg-secondary-50 border-b border-secondary-100">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                                {formatDateRange(limit.fromDate, limit.toDate)}
                              </span>
                            </div>
                            <button
                              onClick={() => handleDeleteLimit(limit.id)}
                              disabled={deletingLimit === limit.id}
                              className="p-1.5 rounded-lg text-secondary-500 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                              aria-label="Delete limit"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                          {limit.limits && Object.keys(limit.limits).length > 0 ? (
                            <div className="grid grid-cols-2 gap-2 p-3">
                              {Object.entries(limit.limits).map(([type, limitValue]) => {
                                const used = usage[type] || 0;
                                const remaining = (limitValue ?? 0) - used;
                                const percentage = limitValue && limitValue > 0 ? Math.min(100, Math.round((used / limitValue) * 100)) : 0;
                                const overused = remaining < 0;
                                return (
                                  <div key={type} className="p-2.5 rounded-lg bg-secondary-50 border border-secondary-100">
                                    <p className="text-xs text-secondary-800 font-medium mb-1 truncate">{type}</p>
                                    <div className="flex items-baseline gap-1 mb-1.5">
                                      <span className="text-lg font-bold text-secondary-900">{used}</span>
                                      <span className="text-xs text-secondary-700">/ {limitValue}</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-secondary-200 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${overused ? 'bg-red-500' : percentage >= 80 ? 'bg-yellow-500' : 'bg-green-500'}`}
                                        style={{ width: `${overused ? 100 : percentage}%` }}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="p-4">
                              <p className="text-xs text-secondary-500">No limits set for this period.</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
