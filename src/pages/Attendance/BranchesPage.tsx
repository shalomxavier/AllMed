import React, { useState, useEffect } from 'react';
import { Building, X, Plus, Pencil, Trash2, Eye, User } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { MultiSelectDropdown } from '@/components/common';
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  updateDoc,
  deleteDoc,
  doc,
  writeBatch,
} from 'firebase/firestore';

interface Branch {
  id: string;
  name: string;
  managerId?: string;
  managerName?: string;
  employeeIds?: string[];
  shiftIds?: string[];
}

interface Manager {
  id: string;
  name: string;
}

interface Employee {
  id: string;
  employeeCode?: string;
  employeeName?: string;
  employmentStatus?: string;
}

interface Shift {
  id: string;
  key: string;
  startTime: string;
  endTime: string;
}

export const BranchesPage: React.FC = () => {
  const { currentUser, userData } = useAuthContext();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [managerId, setManagerId] = useState('');
  const [managers, setManagers] = useState<Manager[]>([]);
  const [saving, setSaving] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [viewingBranch, setViewingBranch] = useState<Branch | null>(null);
  const [branchToDelete, setBranchToDelete] = useState<Branch | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [showEmployeeList, setShowEmployeeList] = useState(false);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftsLoading, setShiftsLoading] = useState(true);
  const [selectedShiftIds, setSelectedShiftIds] = useState<string[]>([]);

  const fetchBranches = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const db = getFirestore();
      const snapshot = await getDocs(collection(db, 'branches'));
      const data: Branch[] = [];
      snapshot.forEach((d) => data.push({ id: d.id, ...(d.data() as Omit<Branch, 'id'>) }));
      setBranches(data);
    } catch (e) {
      console.error('Error fetching branches:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchManagers = async () => {
    if (!currentUser) return;
    try {
      const db = getFirestore();
      const q = query(collection(db, 'users'), where('designation', '==', 'Branch Manager'), orderBy('name'));
      const snapshot = await getDocs(q);
      const data: Manager[] = [];
      snapshot.forEach((d) => {
        const managerData = d.data();
        data.push({ id: d.id, name: managerData.name || 'Unnamed' });
      });
      setManagers(data);
    } catch (e) {
      console.error('Error fetching managers:', e);
    }
  };

  const fetchEmployees = async () => {
    if (!currentUser) return;
    setEmployeesLoading(true);
    try {
      const db = getFirestore();
      const snapshot = await getDocs(collection(db, 'employees'));
      const data: Employee[] = [];
      snapshot.forEach((d) => {
        const employeeData = d.data();
        const employeeCode = employeeData.employeeCode?.toLowerCase() || '';
        const employmentStatus = employeeData.employmentStatus?.toLowerCase() || '';
        
        // Skip inactive employees and those with employee code starting with "del"
        if (employmentStatus === 'inactive' || employeeCode.startsWith('del')) {
          return;
        }
        
        data.push({ 
          id: d.id, 
          employeeCode: employeeData.employeeCode, 
          employeeName: employeeData.employeeName,
          employmentStatus: employeeData.employmentStatus
        });
      });
      setEmployees(data);
    } catch (e) {
      console.error('Error fetching employees:', e);
    } finally {
      setEmployeesLoading(false);
    }
  };

  const fetchShifts = async () => {
    if (!currentUser) return;
    setShiftsLoading(true);
    try {
      const db = getFirestore();
      let allowedShiftIds: string[] | null = null;
      
      // If user is Branch Manager, fetch the branch(es) they manage
      if (userData?.designation === 'Branch Manager' && currentUser) {
        try {
          const branchQuery = query(collection(db, 'branches'), where('managerId', '==', currentUser.uid));
          const branchSnapshot = await getDocs(branchQuery);
          if (!branchSnapshot.empty) {
            const branchData = branchSnapshot.docs[0].data();
            allowedShiftIds = branchData.shiftIds || [];
          } else {
            allowedShiftIds = [];
          }
        } catch (err) {
          console.error('Error fetching branch shifts:', err);
        }
      }

      const snapshot = await getDocs(collection(db, 'shifts'));
      const data: Shift[] = [];
      snapshot.forEach((d) => {
        // Filter by branch if allowedShiftIds is set
        if (allowedShiftIds && !allowedShiftIds.includes(d.id)) {
          return;
        }
        
        const shiftData = d.data();
        data.push({ 
          id: d.id, 
          key: shiftData.key || '',
          startTime: shiftData.startTime || '',
          endTime: shiftData.endTime || ''
        });
      });
      setShifts(data);
    } catch (e) {
      console.error('Error fetching shifts:', e);
    } finally {
      setShiftsLoading(false);
    }
  };

  useEffect(() => {
    fetchBranches();
    fetchManagers();
    fetchEmployees();
    fetchShifts();
  }, [currentUser, userData]);

  const closeModal = () => {
    setModalOpen(false);
    setName('');
    setManagerId('');
    setSelectedEmployeeIds([]);
    setSelectedShiftIds([]);
    setEditingBranch(null);
  };

  const openAddModal = () => {
    setEditingBranch(null);
    setName('');
    setManagerId('');
    setSelectedEmployeeIds([]);
    setSelectedShiftIds([]);
    setModalOpen(true);
  };

  const openEditModal = (branch: Branch) => {
    setEditingBranch(branch);
    setName(branch.name || '');
    setManagerId(branch.managerId || '');
    setSelectedEmployeeIds(branch.employeeIds || []);
    setSelectedShiftIds(branch.shiftIds || []);
    setModalOpen(true);
  };

  const openViewModal = (branch: Branch) => {
    setViewingBranch(branch);
  };

  const selectedManager = managers.find((m) => m.id === managerId);

  const handleSave = async () => {
    if (!currentUser || !name.trim()) return;
    setSaving(true);
    try {
      const db = getFirestore();
      const branchName = name.trim();
      const payload = {
        name: branchName,
        managerId: managerId || '',
        managerName: selectedManager?.name || '',
        employeeIds: selectedEmployeeIds,
        shiftIds: selectedShiftIds,
      };
      
      let branchId: string;
      if (editingBranch) {
        branchId = editingBranch.id;
        await updateDoc(doc(db, 'branches', branchId), payload);
      } else {
        const docRef = await addDoc(collection(db, 'branches'), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        branchId = docRef.id;
      }

      // Update workLocation for all selected employees
      if (selectedEmployeeIds.length > 0) {
        const batch = writeBatch(db);
        selectedEmployeeIds.forEach((employeeId) => {
          const employeeRef = doc(db, 'employees', employeeId);
          batch.update(employeeRef, { workLocation: branchName });
        });
        await batch.commit();
      }

      closeModal();
      fetchBranches();
    } catch (e) {
      console.error('Error saving branch:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (branch: Branch) => {
    setBranchToDelete(branch);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!currentUser || !branchToDelete) return;
    try {
      const db = getFirestore();
      await deleteDoc(doc(db, 'branches', branchToDelete.id));
      setDeleteModalOpen(false);
      setBranchToDelete(null);
      fetchBranches();
    } catch (e) {
      console.error('Error deleting branch:', e);
    }
  };

  return (
    <div className="flex flex-col h-full bg-secondary-50">
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-secondary-200">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-secondary-900">Branches</h1>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors"
        >
          <Plus size={18} />
          Add Branch
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-secondary-300 border-t-cyan-600 rounded-full animate-spin" />
          </div>
        ) : branches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-20 h-20 rounded-full bg-cyan-100 flex items-center justify-center mb-4">
              <Building className="w-10 h-10 text-cyan-600" />
            </div>
            <h3 className="text-lg font-medium text-secondary-900 mb-2">No branches yet</h3>
            <p className="text-sm text-secondary-500 max-w-sm">Add branches to organize employees by office location.</p>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
            {branches.map((branch) => (
              <div
                key={branch.id}
                className="card p-5 hover:shadow-md transition-shadow flex flex-col justify-between min-w-[260px]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-cyan-100 flex items-center justify-center">
                    <Building className="w-6 h-6 text-cyan-600" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-secondary-900 truncate">{branch.name}</h3>
                    {branch.managerName && (
                      <p className="text-xs text-secondary-500 truncate flex items-center gap-1 mt-0.5">
                        <User size={12} />
                        {branch.managerName}
                      </p>
                    )}
                    {branch.employeeIds && branch.employeeIds.length > 0 && (
                      <p className="text-xs text-secondary-500 truncate mt-0.5">
                        {branch.employeeIds.length} employee{branch.employeeIds.length !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex justify-end gap-1 mt-4">
                  <button
                    onClick={() => openViewModal(branch)}
                    className="p-1.5 rounded-lg text-secondary-500 hover:text-cyan-600 hover:bg-cyan-50 transition-colors"
                    aria-label="View"
                  >
                    <Eye size={16} />
                  </button>
                  <button
                    onClick={() => openEditModal(branch)}
                    className="p-1.5 rounded-lg text-secondary-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    aria-label="Edit"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDeleteClick(branch)}
                    className="p-1.5 rounded-lg text-secondary-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                    aria-label="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-xl max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-secondary-200">
              <h2 className="text-base font-semibold text-secondary-900">
                {editingBranch ? 'Edit Branch' : 'Add Branch'}
              </h2>
              <button
                onClick={closeModal}
                className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors"
              >
                <X size={18} className="text-secondary-500" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  Branch Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter branch name"
                  className="w-full px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">Branch Manager</label>
                <select
                  value={managerId}
                  onChange={(e) => setManagerId(e.target.value)}
                  className="w-full px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-white"
                >
                  <option value="">Select a manager</option>
                  {managers.map((manager) => (
                    <option key={manager.id} value={manager.id}>
                      {manager.name}
                    </option>
                  ))}
                </select>
              </div>
              <MultiSelectDropdown
                items={employees.map(e => ({ id: e.id, name: e.employeeName || 'Unnamed', subtitle: e.employeeCode || '' }))}
                selectedIds={selectedEmployeeIds}
                onChange={setSelectedEmployeeIds}
                label="Employees"
                placeholder="Select employees"
                disabled={employeesLoading}
                searchPlaceholder="Search by name or ID..."
                emptyText="No employees found"
                itemLabel="employee"
              />
              <MultiSelectDropdown
                items={shifts.map(s => ({ id: s.id, name: `${s.startTime} - ${s.endTime}`, subtitle: '' }))}
                selectedIds={selectedShiftIds}
                onChange={setSelectedShiftIds}
                label="Shifts"
                placeholder="Select shifts"
                disabled={shiftsLoading}
                searchPlaceholder="Search shifts..."
                emptyText="No shifts found"
                itemLabel="shift"
                showSearch={false}
              />
              <div className="flex gap-2 pt-2">
                <button
                  onClick={closeModal}
                  className="flex-1 px-4 py-2 text-sm font-medium text-secondary-700 bg-white border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !name.trim()}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-70"
                >
                  {saving ? 'Saving...' : editingBranch ? 'Update' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewingBranch && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setViewingBranch(null)}
        >
          <div
            className="bg-white rounded-xl max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-secondary-200">
              <h2 className="text-base font-semibold text-secondary-900">Branch Details</h2>
              <button
                onClick={() => setViewingBranch(null)}
                className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors"
              >
                <X size={18} className="text-secondary-500" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-secondary-500 mb-0.5">Branch Name</label>
                <p className="text-sm font-medium text-secondary-900">{viewingBranch.name || 'Unknown'}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary-500 mb-0.5">Branch Manager</label>
                <p className="text-sm text-secondary-800">
                  {viewingBranch.managerName?.trim() ? viewingBranch.managerName.trim() : '—'}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary-500 mb-0.5">Employees</label>
                {viewingBranch.employeeIds?.length ? (
                  <button
                    onClick={() => setShowEmployeeList(!showEmployeeList)}
                    className="text-sm text-cyan-600 hover:text-cyan-700 font-medium cursor-pointer"
                  >
                    {viewingBranch.employeeIds.length} assigned
                  </button>
                ) : (
                  <p className="text-sm text-secondary-800">—</p>
                )}
              </div>
              {showEmployeeList && viewingBranch.employeeIds && (
                <div className="mt-2 pt-2 border-t border-secondary-200">
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {employees
                      .filter((e) => viewingBranch.employeeIds?.includes(e.id))
                      .map((employee) => (
                        <div key={employee.id} className="text-sm text-secondary-700 py-1">
                          <span className="font-medium">{employee.employeeName || 'Unnamed'}</span>
                          {employee.employeeCode && (
                            <span className="text-secondary-500 ml-2">({employee.employeeCode})</span>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {deleteModalOpen && branchToDelete && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setDeleteModalOpen(false)}
        >
          <div
            className="bg-white rounded-xl max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-secondary-200">
              <h2 className="text-base font-semibold text-secondary-900">Delete Branch</h2>
              <button
                onClick={() => setDeleteModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors"
              >
                <X size={18} className="text-secondary-500" />
              </button>
            </div>
            <div className="p-4">
              <p className="text-sm text-secondary-700 mb-4">
                Are you sure you want to delete{' '}
                <span className="font-medium">{branchToDelete.name}</span>?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setDeleteModalOpen(false)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-secondary-700 bg-white border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
