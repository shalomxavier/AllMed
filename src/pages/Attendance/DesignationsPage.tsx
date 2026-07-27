import React, { useState, useEffect } from 'react';
import { X, Plus, Briefcase, Eye, Pencil, Trash2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '@/contexts/AuthContext';
import { getFirestore, collection, addDoc, getDocs, serverTimestamp, updateDoc, deleteDoc, doc } from 'firebase/firestore';

export const DesignationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuthContext();
  const [modalOpen, setModalOpen] = useState(false);
  const [designation, setDesignation] = useState('');
  const [subDesignations, setSubDesignations] = useState<string[]>(['']);
  const [saving, setSaving] = useState(false);
  const [designations, setDesignations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingDesignation, setEditingDesignation] = useState<any | null>(null);
  const [viewingDesignation, setViewingDesignation] = useState<any | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [designationToDelete, setDesignationToDelete] = useState<any | null>(null);

  const fetchDesignations = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const db = getFirestore();
      const snapshot = await getDocs(collection(db, 'designations'));
      const data: any[] = [];
      snapshot.forEach((d) => data.push({ id: d.id, ...d.data() }));
      setDesignations(data);
    } catch (e) {
      console.error('Error fetching designations:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSubChange = (index: number, value: string) => {
    const updated = [...subDesignations];
    updated[index] = value;
    setSubDesignations(updated);
  };

  const handleAddSub = () => {
    const last = subDesignations[subDesignations.length - 1]?.trim() ?? '';
    if (!last) return;
    const previous = subDesignations.slice(0, -1).map((s) => s.trim().toLowerCase());
    if (previous.includes(last.toLowerCase())) return;
    setSubDesignations([...subDesignations, '']);
  };

  const handleRemoveSub = (index: number) => {
    const updated = subDesignations.filter((_, i) => i !== index);
    if (updated.length === 0) updated.push('');
    setSubDesignations(updated);
  };

  const closeModal = () => {
    setModalOpen(false);
    setDesignation('');
    setSubDesignations(['']);
    setEditingDesignation(null);
  };

  const openAddModal = () => {
    setEditingDesignation(null);
    setDesignation('');
    setSubDesignations(['']);
    setModalOpen(true);
  };

  const openEditModal = (item: any) => {
    setEditingDesignation(item);
    setDesignation(item.name || '');
    setSubDesignations(item.subDesignations?.length > 0 ? [...item.subDesignations] : ['']);
    setModalOpen(true);
  };

  const openViewModal = (item: any) => {
    setViewingDesignation(item);
  };

  const handleDeleteClick = (item: any) => {
    setDesignationToDelete(item);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!currentUser || !designationToDelete) return;
    try {
      const db = getFirestore();
      await deleteDoc(doc(db, 'designations', designationToDelete.id));
      setDeleteModalOpen(false);
      setDesignationToDelete(null);
      fetchDesignations();
    } catch (e) {
      console.error('Error deleting designation:', e);
    }
  };

  const handleSave = async () => {
    const nonEmptySubs = subDesignations.map((s) => s.trim()).filter(Boolean);
    if (!currentUser || !designation.trim() || nonEmptySubs.length === 0) return;
    setSaving(true);
    try {
      const db = getFirestore();
      if (editingDesignation) {
        await updateDoc(doc(db, 'designations', editingDesignation.id), {
          name: designation.trim(),
          subDesignations: nonEmptySubs,
        });
      } else {
        await addDoc(collection(db, 'designations'), {
          name: designation.trim(),
          subDesignations: nonEmptySubs,
          createdAt: serverTimestamp(),
        });
      }
      closeModal();
      fetchDesignations();
    } catch (e) {
      console.error('Error saving designation:', e);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetchDesignations();
  }, [currentUser]);

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
          <h1 className="text-xl font-semibold text-secondary-900">Designations</h1>
        </div>
        <button
          onClick={openAddModal}
          className="px-5 py-2.5 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors"
        >
          Add Designation
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-secondary-300 border-t-teal-600 rounded-full animate-spin" />
          </div>
        ) : designations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-20 h-20 rounded-full bg-teal-100 flex items-center justify-center mb-4">
              <Briefcase className="w-10 h-10 text-teal-600" />
            </div>
            <h3 className="text-lg font-medium text-secondary-900 mb-2">No designations yet</h3>
            <p className="text-sm text-secondary-500 max-w-sm">Add designations and their sub-designations to manage roles.</p>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
            {designations.map((item) => (
              <div key={item.id} className="card p-5 hover:shadow-md transition-shadow flex flex-col justify-between min-w-[260px]">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center">
                    <Briefcase className="w-6 h-6 text-teal-600" />
                  </div>
                  <h3 className="font-semibold text-secondary-900">{item.name || 'Unknown'}</h3>
                </div>
                <div className="flex justify-end gap-1 mt-4">
                  <button
                    onClick={() => openViewModal(item)}
                    className="p-1.5 rounded-lg text-secondary-500 hover:text-teal-600 hover:bg-teal-50 transition-colors"
                    aria-label="View"
                  >
                    <Eye size={16} />
                  </button>
                  <button
                    onClick={() => openEditModal(item)}
                    className="p-1.5 rounded-lg text-secondary-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    aria-label="Edit"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDeleteClick(item)}
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closeModal}>
          <div className="bg-white rounded-xl max-w-md w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-secondary-200">
              <h2 className="text-base font-semibold text-secondary-900">{editingDesignation ? 'Edit Designation' : 'Add Designation'}</h2>
              <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors">
                <X size={18} className="text-secondary-500" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">Designation</label>
                <input
                  type="text"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="Enter designation name"
                  className="w-full px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">Sub Designations</label>
                <div className="space-y-2">
                  {subDesignations.map((sub, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        type="text"
                        value={sub}
                        onChange={(e) => handleSubChange(idx, e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddSub(); }}
                        placeholder="Enter a sub designation"
                        className="flex-1 px-3 py-2 border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      />
                      {idx === subDesignations.length - 1 ? (
                        <button
                          type="button"
                          onClick={handleAddSub}
                          className="px-3 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors"
                        >
                          <Plus size={16} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRemoveSub(idx)}
                          className="px-3 py-2 text-sm font-medium text-secondary-700 bg-white border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
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
                  disabled={saving || !designation.trim() || !subDesignations.some((s) => s.trim())}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-70"
                >
                  {saving ? 'Saving...' : editingDesignation ? 'Update' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewingDesignation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setViewingDesignation(null)}>
          <div className="bg-white rounded-xl max-w-md w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-secondary-200">
              <h2 className="text-base font-semibold text-secondary-900">{viewingDesignation.name || 'Unknown'}</h2>
              <button onClick={() => setViewingDesignation(null)} className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors">
                <X size={18} className="text-secondary-500" />
              </button>
            </div>
            <div className="p-4">
              <label className="block text-sm font-medium text-secondary-700 mb-2">Sub Designations</label>
              {viewingDesignation.subDesignations?.length > 0 ? (
                <ul className="list-disc list-inside space-y-1 text-sm text-secondary-800">
                  {viewingDesignation.subDesignations.map((sub: string, idx: number) => (
                    <li key={idx}>{sub}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-secondary-500">No sub-designations.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {deleteModalOpen && designationToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDeleteModalOpen(false)}>
          <div className="bg-white rounded-xl max-w-md w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-secondary-200">
              <h2 className="text-base font-semibold text-secondary-900">Delete Designation</h2>
              <button onClick={() => setDeleteModalOpen(false)} className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors">
                <X size={18} className="text-secondary-500" />
              </button>
            </div>
            <div className="p-4">
              <p className="text-sm text-secondary-700 mb-4">
                Are you sure you want to delete <span className="font-medium">{designationToDelete.name || 'this designation'}</span>?
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
