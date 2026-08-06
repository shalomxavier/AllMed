import { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw, UserPlus, User, Search, X, Pencil, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { doc, setDoc, getDocs, collection, query, orderBy, updateDoc } from 'firebase/firestore';
import { db, firebaseConfig } from '@/firebase/firebase';
import { RedSpinner } from '@/components/common';

interface User {
  id: string;
  name: string;
  email: string;
  designation: string;
  branch: string;
  createdAt?: string;
}

export const UsersPage: React.FC = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [addUserModalOpen, setAddUserModalOpen] = useState(false);
  const [addUserForm, setAddUserForm] = useState({ name: '', email: '', password: '', designation: '', branch: '' });
  const [addUserError, setAddUserError] = useState('');
  const [addingUser, setAddingUser] = useState(false);
  const [editUserModalOpen, setEditUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editUserForm, setEditUserForm] = useState({ name: '', designation: '', branch: '' });
  const [editUserError, setEditUserError] = useState('');
  const [savingUser, setSavingUser] = useState(false);
  const [viewUserModalOpen, setViewUserModalOpen] = useState(false);
  const [viewingUser, setViewingUser] = useState<User | null>(null);
  const [branchOptions, setBranchOptions] = useState<string[]>([]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const usersData: User[] = [];
      snapshot.forEach((doc) => {
        usersData.push({ id: doc.id, ...doc.data() } as User);
      });
      setUsers(usersData);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchBranches();
  }, []);

  const fetchBranches = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'branches'));
      const branchesData: string[] = [];
      snapshot.forEach((doc) => {
        const branchName = doc.data().name;
        if (branchName) {
          branchesData.push(branchName);
        }
      });
      setBranchOptions(branchesData.sort());
    } catch (error) {
      console.error('Error fetching branches:', error);
    }
  };

  const createUserViaAPI = async (email: string, password: string) => {
    const API_KEY = firebaseConfig.apiKey;
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
      returnSecureToken: true,
        }),
      }
    );
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || 'Failed to create user');
    }
    return data;
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddUserError('');

    const isBranchManager = addUserForm.designation === 'Branch Manager';
    if (!addUserForm.name || !addUserForm.email || !addUserForm.password || !addUserForm.designation || (!isBranchManager && !addUserForm.branch)) {
      setAddUserError('Please fill in all fields');
      return;
    }

    setAddingUser(true);
    try {
      const result = await createUserViaAPI(addUserForm.email, addUserForm.password);
      const userId = result.localId;

      await setDoc(doc(db, 'users', userId), {
        name: addUserForm.name,
        email: addUserForm.email,
        designation: addUserForm.designation,
        branch: isBranchManager ? '' : addUserForm.branch,
        createdAt: new Date().toISOString(),
      });

      setAddUserForm({ name: '', email: '', password: '', designation: '', branch: '' });
      setAddUserModalOpen(false);
      fetchUsers();
    } catch (error: any) {
      let errorMessage = 'Failed to create user';
      if (error.message.includes('EMAIL_EXISTS')) {
        errorMessage = 'An account with this email already exists';
      } else if (error.message.includes('WEAK_PASSWORD')) {
        errorMessage = 'Password should be at least 6 characters';
      } else if (error.message.includes('INVALID_EMAIL')) {
        errorMessage = 'Please enter a valid email address';
      }
      setAddUserError(errorMessage);
    } finally {
      setAddingUser(false);
    }
  };

  const openEditUserModal = (user: User) => {
    setEditingUser(user);
    setEditUserForm({ name: user.name, designation: user.designation, branch: user.designation === 'Branch Manager' ? '' : user.branch });
    setEditUserError('');
    setEditUserModalOpen(true);
  };

  const closeEditUserModal = () => {
    setEditUserModalOpen(false);
    setEditingUser(null);
    setEditUserForm({ name: '', designation: '', branch: '' });
    setEditUserError('');
  };

  const openViewUserModal = (user: User) => {
    setViewingUser(user);
    setViewUserModalOpen(true);
  };

  const closeViewUserModal = () => {
    setViewUserModalOpen(false);
    setViewingUser(null);
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditUserError('');

    const isBranchManager = editUserForm.designation === 'Branch Manager';
    if (!editUserForm.name || !editUserForm.designation || (!isBranchManager && !editUserForm.branch)) {
      setEditUserError('Please fill in all fields');
      return;
    }

    setSavingUser(true);
    try {
      await updateDoc(doc(db, 'users', editingUser.id), {
        name: editUserForm.name,
        designation: editUserForm.designation,
        branch: isBranchManager ? '' : editUserForm.branch,
      });
      closeEditUserModal();
      fetchUsers();
    } catch (error) {
      console.error('Error updating user:', error);
      setEditUserError('Failed to update user');
    } finally {
      setSavingUser(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => navigate('/attendance')} className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors">
          <ArrowLeft size={20} className="text-secondary-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-semibold text-secondary-900">Users</h1>
        </div>
        <button onClick={fetchUsers} className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors">
          {loading ? <RedSpinner size="sm" /> : <RefreshCw size={18} className="text-secondary-500" />}
        </button>
      </div>

      {/* Search & Actions */}
      <div className="px-4 pt-3 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-secondary-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-red-300"
            />
          </div>
          <button onClick={() => setAddUserModalOpen(true)} className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors shrink-0">
            <UserPlus size={16} />
            Add User
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4 content-start">
        {loading ? (
          <div className="w-full flex items-center justify-center py-16">
            <RedSpinner />
          </div>
        ) : users.length === 0 ? (
          <div className="w-full flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-3">
              <UserPlus className="w-8 h-8 text-red-400" />
            </div>
            <p className="text-sm font-medium text-secondary-700">No users found</p>
          </div>
        ) : (
          users.map((user) => (
            <div key={user.id} className="bg-white/30 backdrop-blur-sm rounded-xl p-5 shadow-lg hover:shadow-xl transition-shadow flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <User className="w-6 h-6 text-red-600" />
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openViewUserModal(user)} className="p-1.5 rounded-lg text-secondary-500 hover:text-green-600 hover:bg-green-50 transition-colors" aria-label="View user">
                    <Eye size={16} />
                  </button>
                  <button onClick={() => openEditUserModal(user)} className="p-1.5 rounded-lg text-secondary-500 hover:text-blue-600 hover:bg-blue-50 transition-colors" aria-label="Edit user">
                    <Pencil size={16} />
                  </button>
                </div>
              </div>
              <h3 className="font-semibold text-secondary-900 mb-1">{user.name}</h3>
              <div className="space-y-1 text-sm text-secondary-600 flex-1">
                <p><span className="font-medium">Email:</span> {user.email}</p>
                <p><span className="font-medium">Branch:</span> {user.branch}</p>
                <p><span className="font-medium">Designation:</span> {user.designation}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Edit User Modal */}
      {editUserModalOpen && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-secondary-900">Edit User</h3>
              <button onClick={closeEditUserModal} className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors">
                <X size={18} className="text-secondary-500" />
              </button>
            </div>

            <form onSubmit={handleEditUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">Name</label>
                <input
                  type="text"
                  value={editUserForm.name}
                  onChange={(e) => setEditUserForm({ ...editUserForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-secondary-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-red-300"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">Email</label>
                <input
                  type="email"
                  value={editingUser.email}
                  disabled
                  className="w-full px-3 py-2 text-sm border border-secondary-200 rounded-lg bg-secondary-100 text-secondary-500 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">Designation</label>
                <select
                  value={editUserForm.designation}
                  onChange={(e) => {
                    const newDesignation = e.target.value;
                    setEditUserForm({ 
                      ...editUserForm, 
                      designation: newDesignation,
                      branch: newDesignation === 'Branch Manager' ? '' : editUserForm.branch
                    });
                  }}
                  className="w-full px-3 py-2 text-sm border border-secondary-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-red-300"
                >
                  <option value="">Select designation</option>
                  <option value="Director">Director</option>
                  <option value="HR">HR</option>
                  <option value="Operations Manager">Operations Manager</option>
                  <option value="Branch Manager">Branch Manager</option>
                  <option value="WhatsApp Messager">WhatsApp Messager</option>
                </select>
              </div>

              {editUserForm.designation !== 'Branch Manager' && (
                <div>
                  <label className="block text-sm font-medium text-secondary-700 mb-1">Branch</label>
                  <select
                    value={editUserForm.branch}
                    onChange={(e) => setEditUserForm({ ...editUserForm, branch: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-secondary-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-red-300"
                  >
                    <option value="">Select branch</option>
                    {branchOptions.map((branch) => (
                      <option key={branch} value={branch}>{branch}</option>
                    ))}
                  </select>
                </div>
              )}

              {editUserError && (
                <p className="text-sm text-red-600">{editUserError}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeEditUserModal}
                  className="flex-1 px-4 py-2 text-sm font-medium text-secondary-700 bg-secondary-100 rounded-lg hover:bg-secondary-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-70"
                >
                  {savingUser ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View User Modal */}
      {viewUserModalOpen && viewingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-secondary-900">User Details</h3>
              <button onClick={closeViewUserModal} className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors">
                <X size={18} className="text-secondary-500" />
              </button>
            </div>
            <div className="space-y-3 text-sm text-secondary-700">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <User className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <p className="font-semibold text-secondary-900">{viewingUser.name}</p>
                  <p className="text-secondary-500">{viewingUser.designation}</p>
                </div>
              </div>
              <div className="border-t border-secondary-200 pt-3 space-y-2">
                <p><span className="font-medium">Email:</span> {viewingUser.email}</p>
                <p><span className="font-medium">Branch:</span> {viewingUser.branch}</p>
              </div>
            </div>
            <div className="flex gap-3 pt-6">
              <button
                onClick={closeViewUserModal}
                className="flex-1 px-4 py-2 text-sm font-medium text-secondary-700 bg-secondary-100 rounded-lg hover:bg-secondary-200 transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => {
                  closeViewUserModal();
                  openEditUserModal(viewingUser);
                }}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Edit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {addUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-secondary-900">Add New User</h3>
              <button onClick={() => setAddUserModalOpen(false)} className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors">
                <X size={18} className="text-secondary-500" />
              </button>
            </div>

            <form onSubmit={handleAddUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">Name</label>
                <input
                  type="text"
                  value={addUserForm.name}
                  onChange={(e) => setAddUserForm({ ...addUserForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-secondary-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-red-300"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">Email</label>
                <input
                  type="email"
                  value={addUserForm.email}
                  onChange={(e) => setAddUserForm({ ...addUserForm, email: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-secondary-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-red-300"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">Password</label>
                <input
                  type="password"
                  value={addUserForm.password}
                  onChange={(e) => setAddUserForm({ ...addUserForm, password: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-secondary-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-red-300"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">Designation</label>
                <select
                  value={addUserForm.designation}
                  onChange={(e) => {
                    const newDesignation = e.target.value;
                    setAddUserForm({ 
                      ...addUserForm, 
                      designation: newDesignation,
                      branch: newDesignation === 'Branch Manager' ? '' : addUserForm.branch
                    });
                  }}
                  className="w-full px-3 py-2 text-sm border border-secondary-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-red-300"
                >
                  <option value="">Select designation</option>
                  <option value="Director">Director</option>
                  <option value="HR">HR</option>
                  <option value="Operations Manager">Operations Manager</option>
                  <option value="Branch Manager">Branch Manager</option>
                  <option value="WhatsApp Messager">WhatsApp Messager</option>
                </select>
              </div>

              {addUserForm.designation !== 'Branch Manager' && (
                <div>
                  <label className="block text-sm font-medium text-secondary-700 mb-1">Branch</label>
                  <select
                    value={addUserForm.branch}
                    onChange={(e) => setAddUserForm({ ...addUserForm, branch: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-secondary-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-red-300"
                  >
                    <option value="">Select branch</option>
                    {branchOptions.map((branch) => (
                      <option key={branch} value={branch}>{branch}</option>
                    ))}
                  </select>
                </div>
              )}

              {addUserError && (
                <p className="text-sm text-red-600">{addUserError}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAddUserModalOpen(false)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-secondary-700 bg-secondary-100 rounded-lg hover:bg-secondary-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingUser}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-70"
                >
                  {addingUser ? 'Adding...' : 'Add User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
