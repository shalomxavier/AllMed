import { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw, UserPlus, User, Search, X, Pencil, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { doc, setDoc, getDocs, collection, query, orderBy, updateDoc } from 'firebase/firestore';
import { db, firebaseConfig } from '@/firebase/firebase';
import { RedSpinner } from '@/components/common';
import { PermissionEditor } from '@/components/permissions/PermissionEditor';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  ROLE_NAMES,
  PERMISSION_MODULES,
  hasPermission,
  usePermissions,
  type Role,
  type UserPermissions,
} from '@/permissions';

interface User {
  id: string;
  name: string;
  email: string;
  designation: string;
  roleId?: string;
  permissions?: UserPermissions;
  branch: string;
  createdAt?: string;
}

const getRoleIdFromDesignation = (designation: string): string => {
  switch (designation) {
    case 'Director': return 'director';
    case 'HR': return 'hr';
    case 'Operations Manager': return 'operations-manager';
    case 'Branch Manager': return 'branch-manager';
    case 'WhatsApp Messager': return 'whatsapp-messager';
    default: return '';
  }
};

export const UsersPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuthContext();
  const { hasPermission: checkPermission } = usePermissions();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [addUserModalOpen, setAddUserModalOpen] = useState(false);
  const [addUserForm, setAddUserForm] = useState({ name: '', email: '', password: '', roleId: '', branch: '' });
  const [addUserError, setAddUserError] = useState('');
  const [addingUser, setAddingUser] = useState(false);
  const [editUserModalOpen, setEditUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editUserForm, setEditUserForm] = useState({ name: '', roleId: '', branch: '' });
  const [editUserError, setEditUserError] = useState('');
  const [savingUser, setSavingUser] = useState(false);
  const [viewUserModalOpen, setViewUserModalOpen] = useState(false);
  const [viewingUser, setViewingUser] = useState<User | null>(null);
  const [branchOptions, setBranchOptions] = useState<string[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [addUserPermissions, setAddUserPermissions] = useState<UserPermissions>({});
  const [editUserPermissions, setEditUserPermissions] = useState<UserPermissions>({});

  const fetchRoles = async () => {
    setRolesLoading(true);
    try {
      const snapshot = await getDocs(collection(db, 'roles'));
      const rolesData: Role[] = [];
      snapshot.forEach((d) => rolesData.push({ id: d.id, ...d.data() } as Role));
      rolesData.sort((a, b) => a.name.localeCompare(b.name));
      setRoles(rolesData);
    } catch (error) {
      console.error('Error fetching roles:', error);
    } finally {
      setRolesLoading(false);
    }
  };

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
    fetchRoles();
  }, []);

  // users.roleManagement.edit holders (in practice Directors) may assign roles
  // and permissions. Permissions are stored directly on each user document.
  const canManageUserPermissions = checkPermission('users', 'roleManagement', 'edit');
  const canAddUser = checkPermission('users', 'userManagement', 'add');
  const canEditUser = checkPermission('users', 'userManagement', 'edit');

  const viewingRoleId = viewingUser ? viewingUser.roleId || getRoleIdFromDesignation(viewingUser.designation) : '';
  const viewingPermissions = viewingUser?.permissions ?? {};

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

    const isBranchManager = addUserForm.roleId === 'branch-manager';
    if (!addUserForm.name || !addUserForm.email || !addUserForm.password || !addUserForm.roleId || (!isBranchManager && !addUserForm.branch)) {
      setAddUserError('Please fill in all fields');
      return;
    }

    setAddingUser(true);
    try {
      const result = await createUserViaAPI(addUserForm.email, addUserForm.password);
      const userId = result.localId;
      const designation = ROLE_NAMES[addUserForm.roleId] || '';

      const newUserDoc: Record<string, unknown> = {
        name: addUserForm.name,
        email: addUserForm.email,
        roleId: addUserForm.roleId,
        designation,
        branch: isBranchManager ? '' : addUserForm.branch,
        createdAt: new Date().toISOString(),
      };
      // Permissions are assigned individually to this user. Only callers with
      // roleManagement authority may write the permissions field.
      if (canManageUserPermissions) {
        newUserDoc.permissions = addUserPermissions;
      }
      await setDoc(doc(db, 'users', userId), newUserDoc);

      setAddUserForm({ name: '', email: '', password: '', roleId: '', branch: '' });
      setAddUserPermissions({});
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
    const roleId = user.roleId || getRoleIdFromDesignation(user.designation);
    setEditUserForm({ name: user.name, roleId, branch: roleId === 'branch-manager' ? '' : user.branch });
    setEditUserPermissions(user.permissions ?? {});
    setEditUserError('');
    setEditUserModalOpen(true);
  };

  const closeEditUserModal = () => {
    setEditUserModalOpen(false);
    setEditingUser(null);
    setEditUserForm({ name: '', roleId: '', branch: '' });
    setEditUserPermissions({});
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

    const isBranchManager = editUserForm.roleId === 'branch-manager';
    if (!editUserForm.name || !editUserForm.roleId || (!isBranchManager && !editUserForm.branch)) {
      setEditUserError('Please fill in all fields');
      return;
    }

    setSavingUser(true);
    try {
      // Prevent self-escalation: nobody may change their own role or
      // permissions, and only roleManagement authority may change another
      // user's role/permissions.
      const isSelf = editingUser.id === currentUser?.uid;
      const updates: Record<string, unknown> = {
        name: editUserForm.name,
        branch: isBranchManager ? '' : editUserForm.branch,
      };
      if (canManageUserPermissions && !isSelf) {
        updates.roleId = editUserForm.roleId;
        updates.designation = ROLE_NAMES[editUserForm.roleId] || '';
        updates.permissions = editUserPermissions;
      }
      await updateDoc(doc(db, 'users', editingUser.id), updates);

      closeEditUserModal();
      fetchUsers();
    } catch (error) {
      console.error('Error updating user:', error);
      setEditUserError('Failed to update user');
    } finally {
      setSavingUser(false);
    }
  };

  const filteredUsers = users.filter((user) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      user.name?.toLowerCase().includes(query) ||
      user.email?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 py-3">
        <button onClick={() => navigate('/attendance')} className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors">
          <ArrowLeft size={20} className="text-secondary-600" />
        </button>
        <div className="flex-1">
          <h1 className="page-title">Users</h1>
        </div>
        <button onClick={fetchUsers} className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors">
          {loading ? <RedSpinner size="sm" /> : <RefreshCw size={18} className="text-secondary-500" />}
        </button>
      </div>

      {/* Search & Actions */}
      <div className="pt-3 pb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-secondary-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canAddUser && (
              <button onClick={() => setAddUserModalOpen(true)} className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors">
                <UserPlus size={16} />
                Add User
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-4 grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4 content-start">
        {loading ? (
          <div className="w-full flex items-center justify-center py-16">
            <RedSpinner />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="w-full flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-secondary-100 flex items-center justify-center mb-3">
              <UserPlus className="w-8 h-8 text-secondary-400" />
            </div>
            <p className="text-sm font-medium text-secondary-700">No users found</p>
          </div>
        ) : (
          filteredUsers.map((user) => (
            <div key={user.id} className="card p-5 hover:shadow-md transition-shadow flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <div className="w-12 h-12 rounded-full bg-secondary-100 flex items-center justify-center">
                  <User className="w-6 h-6 text-secondary-500" />
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openViewUserModal(user)} className="p-1.5 rounded-lg text-secondary-500 hover:text-secondary-700 hover:bg-secondary-100 transition-colors" aria-label="View user">
                    <Eye size={16} />
                  </button>
                  {canEditUser && (
                    <button onClick={() => openEditUserModal(user)} className="p-1.5 rounded-lg text-secondary-500 hover:text-secondary-700 hover:bg-secondary-100 transition-colors" aria-label="Edit user">
                      <Pencil size={16} />
                    </button>
                  )}
                </div>
              </div>
              <h3 className="font-semibold text-secondary-900 mb-1">{user.name}</h3>
              <div className="space-y-1 text-sm text-secondary-600 flex-1">
                <p><span className="font-medium">Email:</span> {user.email}</p>
                <p><span className="font-medium">Branch:</span> {user.branch}</p>
                <p><span className="font-medium">Role:</span> {ROLE_NAMES[user.roleId || getRoleIdFromDesignation(user.designation)] || user.designation || 'Unknown'}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Edit User Modal */}
      {editUserModalOpen && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-secondary-900">Edit User</h3>
              <button onClick={closeEditUserModal} className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors">
                <X size={18} className="text-secondary-500" />
              </button>
            </div>

            <form onSubmit={handleEditUser} className="space-y-4 overflow-y-auto flex-1 -mr-2 pr-2">
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">Name</label>
                <input
                  type="text"
                  value={editUserForm.name}
                  onChange={(e) => setEditUserForm({ ...editUserForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-secondary-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
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
                <label className="block text-sm font-medium text-secondary-700 mb-1">Role</label>
                <select
                  value={editUserForm.roleId}
                  onChange={(e) => {
                    const newRoleId = e.target.value;
                    // Changing the role never modifies this user's permissions.
                    setEditUserForm({
                      ...editUserForm,
                      roleId: newRoleId,
                      branch: newRoleId === 'branch-manager' ? '' : editUserForm.branch
                    });
                  }}
                  disabled={rolesLoading || !canManageUserPermissions || editingUser.id === currentUser?.uid}
                  className="w-full px-3 py-2 text-sm border border-secondary-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-secondary-100 disabled:cursor-not-allowed"
                >
                  <option value="">{rolesLoading ? 'Loading roles...' : 'Select role'}</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
              </div>

              <PermissionEditor
                value={editUserPermissions}
                onChange={setEditUserPermissions}
                readOnly={!canManageUserPermissions || editingUser.id === currentUser?.uid}
              />

              {editUserForm.roleId !== 'branch-manager' && (
                <div>
                  <label className="block text-sm font-medium text-secondary-700 mb-1">Branch</label>
                  <select
                    value={editUserForm.branch}
                    onChange={(e) => setEditUserForm({ ...editUserForm, branch: e.target.value })}
                    disabled={editingUser.id === currentUser?.uid}
                    className="w-full px-3 py-2 text-sm border border-secondary-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-secondary-100 disabled:cursor-not-allowed"
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
                {canEditUser && (
                  <button
                    type="submit"
                    disabled={savingUser}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-70"
                  >
                    {savingUser ? 'Saving...' : 'Save Changes'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View User Modal */}
      {viewUserModalOpen && viewingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-secondary-900">User Details</h3>
              <button onClick={closeViewUserModal} className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors">
                <X size={18} className="text-secondary-500" />
              </button>
            </div>
            <div className="space-y-3 text-sm text-secondary-700 overflow-y-auto flex-1 -mr-2 pr-2">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-secondary-100 flex items-center justify-center">
                  <User className="w-6 h-6 text-secondary-500" />
                </div>
                <div>
                  <p className="font-semibold text-secondary-900">{viewingUser.name}</p>
                  <p className="text-secondary-500">{ROLE_NAMES[viewingRoleId] || viewingUser.designation || 'Unknown'}</p>
                </div>
              </div>
              <div className="border-t border-secondary-200 pt-3 space-y-2">
                <p><span className="font-medium">Email:</span> {viewingUser.email}</p>
                <p><span className="font-medium">Branch:</span> {viewingUser.branch}</p>
              </div>
              <div className="border-t border-secondary-200 pt-3">
                <p className="font-medium mb-1">Permissions</p>
                <p className="text-xs text-secondary-500 mb-2">
                  Permissions are assigned individually to this user.
                </p>
                <div className="border border-secondary-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-secondary-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-secondary-700">Module</th>
                        <th className="px-3 py-2 text-left font-semibold text-secondary-700">Permission</th>
                        <th className="px-3 py-2 text-left font-semibold text-secondary-700">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-secondary-100">
                      {PERMISSION_MODULES.map((module) => {
                        const modulePermissions = viewingPermissions[module.key];
                        const rows = module.items
                          .map((item) => ({
                            label: item.label,
                            actions: item.actions.filter((action) =>
                              hasPermission(viewingPermissions, module.key, item.key, action)),
                          }))
                          .filter((row) => row.actions.length > 0);
                        if (rows.length === 0) return null;
                        return rows.map((row, rowIndex) => (
                          <tr key={`${module.key}-${row.label}`} className={rowIndex === 0 ? 'border-t-2 border-secondary-200' : ''}>
                            {rowIndex === 0 && (
                              <td rowSpan={rows.length} className="px-3 py-2 font-medium text-secondary-900 align-top">
                                {module.label}
                                {modulePermissions?.accessMode === 'full' && (
                                  <span className="block text-[10px] font-medium text-primary-600 mt-0.5">Full access</span>
                                )}
                              </td>
                            )}
                            <td className="px-3 py-2 text-secondary-700">{row.label}</td>
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-1">
                                {row.actions.map((action) => (
                                  <span
                                    key={action}
                                    className="inline-flex items-center px-1.5 py-0.5 rounded capitalize bg-secondary-100 text-secondary-600"
                                  >
                                    {action}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ));
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="flex gap-3 pt-6">
              <button
                onClick={closeViewUserModal}
                className="flex-1 px-4 py-2 text-sm font-medium text-secondary-700 bg-secondary-100 rounded-lg hover:bg-secondary-200 transition-colors"
              >
                Close
              </button>
              {canEditUser && (
                <button
                  onClick={() => {
                    closeViewUserModal();
                    openEditUserModal(viewingUser);
                  }}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                >
                  Edit
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {addUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-secondary-900">Add New User</h3>
              <button onClick={() => setAddUserModalOpen(false)} className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors">
                <X size={18} className="text-secondary-500" />
              </button>
            </div>

            <form onSubmit={handleAddUser} className="space-y-4 overflow-y-auto flex-1 -mr-2 pr-2">
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">Name</label>
                <input
                  type="text"
                  value={addUserForm.name}
                  onChange={(e) => setAddUserForm({ ...addUserForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-secondary-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">Email</label>
                <input
                  type="email"
                  value={addUserForm.email}
                  onChange={(e) => setAddUserForm({ ...addUserForm, email: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-secondary-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">Password</label>
                <input
                  type="password"
                  value={addUserForm.password}
                  onChange={(e) => setAddUserForm({ ...addUserForm, password: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-secondary-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">Role</label>
                <select
                  value={addUserForm.roleId}
                  onChange={(e) => {
                    const newRoleId = e.target.value;
                    // Role selection never pre-fills or changes permissions.
                    setAddUserForm({
                      ...addUserForm,
                      roleId: newRoleId,
                      branch: newRoleId === 'branch-manager' ? '' : addUserForm.branch
                    });
                  }}
                  disabled={rolesLoading}
                  className="w-full px-3 py-2 text-sm border border-secondary-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-secondary-100 disabled:cursor-not-allowed"
                >
                  <option value="">{rolesLoading ? 'Loading roles...' : 'Select role'}</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
              </div>

              <PermissionEditor
                value={addUserPermissions}
                onChange={setAddUserPermissions}
                readOnly={!canManageUserPermissions}
              />

              {addUserForm.roleId !== 'branch-manager' && (
                <div>
                  <label className="block text-sm font-medium text-secondary-700 mb-1">Branch</label>
                  <select
                    value={addUserForm.branch}
                    onChange={(e) => setAddUserForm({ ...addUserForm, branch: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-secondary-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
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
                {canAddUser && (
                  <button
                    type="submit"
                    disabled={addingUser}
                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-70"
                  >
                    {addingUser ? 'Adding...' : 'Add User'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
