import React, { useState, useEffect } from 'react';
import { Building2, X, Plus, Pencil, Trash2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  serverTimestamp,
  updateDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore';

interface Department {
  id: string;
  name: string;
}

export const DepartmentsPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuthContext();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [departmentToDelete, setDepartmentToDelete] = useState<Department | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const fetchDepartments = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const db = getFirestore();
      const snapshot = await getDocs(collection(db, 'departments'));
      const data: Department[] = [];
      snapshot.forEach((d) => data.push({ id: d.id, ...(d.data() as Omit<Department, 'id'>) }));
      setDepartments(data);
    } catch (e) {
      console.error('Error fetching departments:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDepartments();
  }, [currentUser]);

  const closeModal = () => {
    setModalOpen(false);
    setName('');
    setEditingDepartment(null);
  };

  const openAddModal = () => {
    setEditingDepartment(null);
    setName('');
    setModalOpen(true);
  };

  const openEditModal = (department: Department) => {
    setEditingDepartment(department);
    setName(department.name || '');
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!currentUser || !name.trim()) return;
    setSaving(true);
    try {
      const db = getFirestore();
      if (editingDepartment) {
        await updateDoc(doc(db, 'departments', editingDepartment.id), {
          name: name.trim(),
        });
      } else {
        await addDoc(collection(db, 'departments'), {
          name: name.trim(),
          createdAt: serverTimestamp(),
        });
      }
      closeModal();
      fetchDepartments();
    } catch (e) {
      console.error('Error saving department:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (department: Department) => {
    setDepartmentToDelete(department);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!currentUser || !departmentToDelete) return;
    try {
      const db = getFirestore();
      await deleteDoc(doc(db, 'departments', departmentToDelete.id));
      setDeleteModalOpen(false);
      setDepartmentToDelete(null);
      fetchDepartments();
    } catch (e) {
      console.error('Error deleting department:', e);
    }
  };

  return (
    <div className="flex flex-col h-full bg-secondary-50">
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-secondary-200">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/attendance')}
            className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft size={20} className="text-secondary-600" />
          </button>
          <h1 className="text-xl font-semibold text-secondary-900">Departments</h1>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus size={18} />
          Add Department
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-secondary-300 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : departments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-20 h-20 rounded-full bg-indigo-100 flex items-center justify-center mb-4">
              <Building2 className="w-10 h-10 text-indigo-600" />
            </div>
            <h3 className="text-lg font-medium text-secondary-900 mb-2">No departments yet</h3>
            <p className="text-sm text-secondary-500 max-w-sm">Add departments to organize employees by department.</p>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
            {departments.map((department) => (
              <div
                key={department.id}
                className="card p-5 hover:shadow-md transition-shadow flex flex-col justify-between min-w-[260px]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-indigo-600" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-secondary-900 truncate">{department.name}</h3>
                  </div>
                </div>
                <div className="flex justify-end gap-1 mt-4">
                  <button
                    onClick={() => openEditModal(department)}
                    className="p-1.5 rounded-lg text-secondary-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    aria-label="Edit"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDeleteClick(department)}
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
                {editingDepartment ? 'Edit Department' : 'Add Department'}
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
                  Department Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter department name"
                  className="w-full px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
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
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-70"
                >
                  {saving ? 'Saving...' : editingDepartment ? 'Update' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteModalOpen && departmentToDelete && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setDeleteModalOpen(false)}
        >
          <div
            className="bg-white rounded-xl max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-secondary-200">
              <h2 className="text-base font-semibold text-secondary-900">Delete Department</h2>
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
                <span className="font-medium">{departmentToDelete.name}</span>?
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
