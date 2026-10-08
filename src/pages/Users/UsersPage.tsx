import { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw, UserPlus, User, Search, X, Pencil, Eye, ShieldCheck, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { doc, setDoc, getDocs, collection, query, orderBy, updateDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db, firebaseConfig } from '@/firebase/firebase';
import { RedSpinner } from '@/components/common';
import { PermissionEditor } from '@/components/permissions/PermissionEditor';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  ROLE_NAMES,
  ROLE_IDS,
  DEFAULT_ROLE_PERMISSIONS,
  hasPermission,
  type Role,
  type RolePermissions,
} from '@/permissions';

interface User {
  id: string;
  name: string;
  email: string;
  designation: string;
  roleId?: string;
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

interface MigrationPlan {
  totalUsers: number;
  byDesignation: Record<string, number>;
  alreadyHaveRoleId: number;
  willMigrate: number;
  unknown: { id: string; designation: string; name?: string; email?: string }[];
  migrations: { id: string; designation: string; roleId: string; name?: string; email?: string }[];
  roleReports: { roleId: string; exists: boolean; needsCreate: boolean; needsUpdate: boolean }[];
}

export const UsersPage: React.FC = () => {
  const navigate = useNavigate();
  const { permissions: currentUserPermissions } = useAuthContext();
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
  const [addUserRolePermissions, setAddUserRolePermissions] = useState<RolePermissions | null>(null);
  const [editUserRolePermissions, setEditUserRolePermissions] = useState<RolePermissions | null>(null);
  const [canManageRolePermissions, setCanManageRolePermissions] = useState(false);
  const [migrationPreviewOpen, setMigrationPreviewOpen] = useState(false);
  const [migrationPreviewLoading, setMigrationPreviewLoading] = useState(false);
  const [migrationPreview, setMigrationPreview] = useState<MigrationPlan | null>(null);
  const [migrationRunOpen, setMigrationRunOpen] = useState(false);
  const [migrationRunLoading, setMigrationRunLoading] = useState(false);
  const [migrationRunPlan, setMigrationRunPlan] = useState<MigrationPlan | null>(null);
  const [migrationRunning, setMigrationRunning] = useState(false);
  const [migrationResult, setMigrationResult] = useState<{
    rolesCreated: string[];
    rolesUpdated: string[];
    rolesUpToDate: string[];
    usersMigrated: { id: string; designation: string; roleId: string; name?: string; email?: string }[];
    usersSkipped: number;
    unknown: { id: string; designation: string; name?: string; email?: string }[];
  } | null>(null);
  const [migrationError, setMigrationError] = useState('');

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

  useEffect(() => {
    setCanManageRolePermissions(
      currentUserPermissions ? hasPermission(currentUserPermissions, 'users', 'roleManagement', 'edit') : false
    );
  }, [currentUserPermissions]);

  const canAddUser = currentUserPermissions ? hasPermission(currentUserPermissions, 'users', 'userManagement', 'add') : false;
  const canEditUser = currentUserPermissions ? hasPermission(currentUserPermissions, 'users', 'userManagement', 'edit') : false;

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

  const roleIdFromDesignation = (designation: string): string | null => {
    const map: Record<string, string> = {
      'Director': ROLE_IDS.DIRECTOR,
      'HR': ROLE_IDS.HR,
      'Operations Manager': ROLE_IDS.OPERATIONS_MANAGER,
      'Branch Manager': ROLE_IDS.BRANCH_MANAGER,
      'WhatsApp Messager': ROLE_IDS.WHATSAPP_MESSAGER,
    };
    const normalized = designation?.trim();
    return map[normalized] || null;
  };

  const computeMigrationPlan = async (): Promise<MigrationPlan> => {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    const rolesSnapshot = await getDocs(collection(db, 'roles'));

    const existingRoleIds = new Set(rolesSnapshot.docs.map((d) => d.id));
    const roleReports = Object.values(ROLE_IDS).map((roleId) => {
      const existing = rolesSnapshot.docs.find((d) => d.id === roleId);
      const defaultPermissions = DEFAULT_ROLE_PERMISSIONS[roleId];
      const needsCreate = !existing;
      const needsUpdate = existing ? JSON.stringify(existing.data().permissions) !== JSON.stringify(defaultPermissions) : false;
      return {
        roleId,
        exists: !!existingRoleIds.has(roleId),
        needsCreate,
        needsUpdate,
      };
    });

    const byDesignation: Record<string, number> = {};
    const migrations: { id: string; designation: string; roleId: string; name?: string; email?: string }[] = [];
    const unknown: { id: string; designation: string; name?: string; email?: string }[] = [];
    let alreadyHaveRoleId = 0;

    usersSnapshot.docs.forEach((d) => {
      const data = d.data();
      const designation = data.designation || '(missing)';
      byDesignation[designation] = (byDesignation[designation] || 0) + 1;

      if (data.roleId && typeof data.roleId === 'string') {
        alreadyHaveRoleId++;
        return;
      }

      const roleId = roleIdFromDesignation(data.designation);
      if (!roleId) {
        unknown.push({ id: d.id, designation: data.designation || '(missing)', name: data.name, email: data.email });
        return;
      }

      migrations.push({ id: d.id, designation: data.designation || '(missing)', roleId, name: data.name, email: data.email });
    });

    return {
      totalUsers: usersSnapshot.size,
      byDesignation,
      alreadyHaveRoleId,
      willMigrate: migrations.length,
      unknown,
      migrations,
      roleReports,
    };
  };

  const runMigrationPreview = async () => {
    setMigrationPreviewLoading(true);
    try {
      setMigrationPreview(await computeMigrationPlan());
      setMigrationPreviewOpen(true);
    } catch (error) {
      console.error('Error running migration preview:', error);
    } finally {
      setMigrationPreviewLoading(false);
    }
  };

  const openMigrationRun = async () => {
    setMigrationRunLoading(true);
    setMigrationError('');
    setMigrationResult(null);
    try {
      setMigrationRunPlan(await computeMigrationPlan());
      setMigrationRunOpen(true);
    } catch (error) {
      console.error('Error computing migration plan:', error);
    } finally {
      setMigrationRunLoading(false);
    }
  };

  const executeMigration = async () => {
    setMigrationRunning(true);
    setMigrationError('');
    try {
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const rolesSnapshot = await getDocs(collection(db, 'roles'));

      // Seed the five fixed role documents. Never creates roles beyond ROLE_IDS.
      const rolesCreated: string[] = [];
      const rolesUpdated: string[] = [];
      const rolesUpToDate: string[] = [];
      for (const roleId of Object.values(ROLE_IDS)) {
        const existing = rolesSnapshot.docs.find((d) => d.id === roleId);
        const expectedPermissions = DEFAULT_ROLE_PERMISSIONS[roleId];
        if (!existing) {
          rolesCreated.push(roleId);
        } else if (JSON.stringify(existing.data().permissions) !== JSON.stringify(expectedPermissions)) {
          rolesUpdated.push(roleId);
        } else {
          rolesUpToDate.push(roleId);
          continue;
        }
        await setDoc(doc(db, 'roles', roleId), {
          name: ROLE_NAMES[roleId],
          description: `Fixed application role: ${ROLE_NAMES[roleId]}`,
          isFixed: true,
          permissions: expectedPermissions,
          ...(!existing ? { createdAt: serverTimestamp() } : {}),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }

      // Add roleId only to users that do not already have one. No other field is touched.
      const migrated: { id: string; designation: string; roleId: string; name?: string; email?: string }[] = [];
      const unknown: { id: string; designation: string; name?: string; email?: string }[] = [];
      let usersSkipped = 0;
      const batch = writeBatch(db);
      usersSnapshot.docs.forEach((d) => {
        const data = d.data();
        if (data.roleId && typeof data.roleId === 'string') {
          usersSkipped++;
          return;
        }
        const roleId = roleIdFromDesignation(data.designation);
        if (!roleId) {
          unknown.push({ id: d.id, designation: data.designation || '(missing)', name: data.name, email: data.email });
          return;
        }
        batch.update(d.ref, { roleId });
        migrated.push({ id: d.id, designation: data.designation || '(missing)', roleId, name: data.name, email: data.email });
      });
      if (migrated.length > 0) {
        await batch.commit();
      }

      setMigrationResult({ rolesCreated, rolesUpdated, rolesUpToDate, usersMigrated: migrated, usersSkipped, unknown });
      fetchUsers();
      fetchRoles();
    } catch (error) {
      console.error('Error running migration:', error);
      setMigrationError('Migration failed. Check the console for details.');
    } finally {
      setMigrationRunning(false);
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

      await setDoc(doc(db, 'users', userId), {
        name: addUserForm.name,
        email: addUserForm.email,
        roleId: addUserForm.roleId,
        designation,
        branch: isBranchManager ? '' : addUserForm.branch,
        createdAt: new Date().toISOString(),
      });

      // If role permissions were edited while creating the user, persist them on the role.
      if (canManageRolePermissions && addUserRolePermissions && addUserForm.roleId) {
        await updateDoc(doc(db, 'roles', addUserForm.roleId), {
          permissions: addUserRolePermissions,
          updatedAt: serverTimestamp(),
        });
      }

      setAddUserForm({ name: '', email: '', password: '', roleId: '', branch: '' });
      setAddUserRolePermissions(null);
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
    setEditUserRolePermissions(null);
    setEditUserError('');
    setEditUserModalOpen(true);
  };

  const closeEditUserModal = () => {
    setEditUserModalOpen(false);
    setEditingUser(null);
    setEditUserForm({ name: '', roleId: '', branch: '' });
    setEditUserRolePermissions(null);
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
      const designation = ROLE_NAMES[editUserForm.roleId] || '';
      await updateDoc(doc(db, 'users', editingUser.id), {
        name: editUserForm.name,
        roleId: editUserForm.roleId,
        designation,
        branch: isBranchManager ? '' : editUserForm.branch,
      });

      // If role permissions were edited while editing the user, persist them on the role.
      if (canManageRolePermissions && editUserRolePermissions && editUserForm.roleId) {
        await updateDoc(doc(db, 'roles', editUserForm.roleId), {
          permissions: editUserRolePermissions,
          updatedAt: serverTimestamp(),
        });
      }

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
            {canManageRolePermissions && (
              <>
                <button
                  onClick={runMigrationPreview}
                  disabled={migrationPreviewLoading}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-secondary-700 bg-white border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {migrationPreviewLoading ? <RedSpinner size="sm" /> : <ShieldCheck size={16} />}
                  Migration Preview
                </button>
                <button
                  onClick={openMigrationRun}
                  disabled={migrationRunLoading || migrationRunning}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-secondary-700 bg-white border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {migrationRunLoading ? <RedSpinner size="sm" /> : <Play size={16} />}
                  Run Migration
                </button>
              </>
            )}
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
        ) : users.length === 0 ? (
          <div className="w-full flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-secondary-100 flex items-center justify-center mb-3">
              <UserPlus className="w-8 h-8 text-secondary-400" />
            </div>
            <p className="text-sm font-medium text-secondary-700">No users found</p>
          </div>
        ) : (
          users.map((user) => (
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
                    setEditUserForm({
                      ...editUserForm,
                      roleId: newRoleId,
                      branch: newRoleId === 'branch-manager' ? '' : editUserForm.branch
                    });
                    setEditUserRolePermissions(null);
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

              {editUserForm.roleId && (
                <PermissionEditor
                  roleId={editUserForm.roleId}
                  roleName={roles.find((r) => r.id === editUserForm.roleId)?.name}
                  value={editUserRolePermissions ?? roles.find((r) => r.id === editUserForm.roleId)?.permissions ?? null}
                  onChange={setEditUserRolePermissions}
                  readOnly={!canManageRolePermissions}
                />
              )}

              {editUserForm.roleId !== 'branch-manager' && (
                <div>
                  <label className="block text-sm font-medium text-secondary-700 mb-1">Branch</label>
                  <select
                    value={editUserForm.branch}
                    onChange={(e) => setEditUserForm({ ...editUserForm, branch: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-secondary-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-secondary-900">User Details</h3>
              <button onClick={closeViewUserModal} className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors">
                <X size={18} className="text-secondary-500" />
              </button>
            </div>
            <div className="space-y-3 text-sm text-secondary-700">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-secondary-100 flex items-center justify-center">
                  <User className="w-6 h-6 text-secondary-500" />
                </div>
                <div>
                  <p className="font-semibold text-secondary-900">{viewingUser.name}</p>
                  <p className="text-secondary-500">{ROLE_NAMES[viewingUser.roleId || getRoleIdFromDesignation(viewingUser.designation)] || viewingUser.designation || 'Unknown'}</p>
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
                    setAddUserForm({
                      ...addUserForm,
                      roleId: newRoleId,
                      branch: newRoleId === 'branch-manager' ? '' : addUserForm.branch
                    });
                    setAddUserRolePermissions(null);
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

              {addUserForm.roleId && (
                <PermissionEditor
                  roleId={addUserForm.roleId}
                  roleName={roles.find((r) => r.id === addUserForm.roleId)?.name}
                  value={addUserRolePermissions ?? roles.find((r) => r.id === addUserForm.roleId)?.permissions ?? null}
                  onChange={setAddUserRolePermissions}
                  readOnly={!canManageRolePermissions}
                />
              )}

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

      {/* Migration Preview Modal */}
      {migrationPreviewOpen && migrationPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-secondary-200">
              <div>
                <h3 className="text-lg font-semibold text-secondary-900">RBAC Migration Preview</h3>
                <p className="text-xs text-secondary-500 mt-0.5">Dry-run report — no data will be modified</p>
              </div>
              <button onClick={() => setMigrationPreviewOpen(false)} className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors">
                <X size={18} className="text-secondary-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Role Records */}
              <div>
                <h4 className="text-sm font-semibold text-secondary-900 mb-2">Role Documents</h4>
                <div className="border border-secondary-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary-50">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-secondary-700">Role</th>
                        <th className="px-4 py-2 text-left font-medium text-secondary-700">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-secondary-100">
                      {migrationPreview.roleReports.map((role) => (
                        <tr key={role.roleId}>
                          <td className="px-4 py-2">
                            <span className="font-medium text-secondary-900">{ROLE_NAMES[role.roleId]}</span>
                            <span className="ml-2 text-xs text-secondary-500 font-mono">{role.roleId}</span>
                          </td>
                          <td className="px-4 py-2">
                            {role.needsCreate ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700">Will create</span>
                            ) : role.needsUpdate ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-50 text-orange-700">Will update permissions</span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary-100 text-secondary-600">Up-to-date</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Summary */}
              <div>
                <h4 className="text-sm font-semibold text-secondary-900 mb-2">User Analysis</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="card p-4">
                    <p className="text-xs text-secondary-500">Total users</p>
                    <p className="text-2xl font-semibold text-secondary-900">{migrationPreview.totalUsers}</p>
                  </div>
                  <div className="card p-4">
                    <p className="text-xs text-secondary-500">Already have roleId</p>
                    <p className="text-2xl font-semibold text-secondary-900">{migrationPreview.alreadyHaveRoleId}</p>
                  </div>
                  <div className="card p-4">
                    <p className="text-xs text-secondary-500">Will migrate</p>
                    <p className="text-2xl font-semibold text-primary-600">{migrationPreview.willMigrate}</p>
                  </div>
                  <div className="card p-4">
                    <p className="text-xs text-secondary-500">Unknown / unmapped</p>
                    <p className="text-2xl font-semibold text-red-600">{migrationPreview.unknown.length}</p>
                  </div>
                </div>
              </div>

              {/* Users by designation */}
              <div>
                <h4 className="text-sm font-semibold text-secondary-900 mb-2">Users by Designation</h4>
                <div className="border border-secondary-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary-50">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-secondary-700">Designation</th>
                        <th className="px-4 py-2 text-left font-medium text-secondary-700">Count</th>
                        <th className="px-4 py-2 text-left font-medium text-secondary-700">Mapped Role</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-secondary-100">
                      {Object.entries(migrationPreview.byDesignation).map(([designation, count]) => {
                        const mappedRoleId = roleIdFromDesignation(designation);
                        return (
                          <tr key={designation}>
                            <td className="px-4 py-2 font-medium text-secondary-900">{designation}</td>
                            <td className="px-4 py-2">{count}</td>
                            <td className="px-4 py-2">
                              {mappedRoleId ? (
                                <span className="text-secondary-700">{ROLE_NAMES[mappedRoleId]}</span>
                              ) : (
                                <span className="text-red-600 font-medium">Unknown</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Migrations */}
              {migrationPreview.migrations.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-secondary-900 mb-2">Users That Will Be Migrated ({migrationPreview.migrations.length})</h4>
                  <div className="border border-secondary-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-secondary-50 sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-secondary-700">Name</th>
                          <th className="px-4 py-2 text-left font-medium text-secondary-700">Designation</th>
                          <th className="px-4 py-2 text-left font-medium text-secondary-700">New Role</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-secondary-100">
                        {migrationPreview.migrations.map((m) => (
                          <tr key={m.id}>
                            <td className="px-4 py-2">
                              <p className="font-medium text-secondary-900">{m.name || '—'}</p>
                              {m.email && <p className="text-xs text-secondary-500">{m.email}</p>}
                            </td>
                            <td className="px-4 py-2">{m.designation}</td>
                            <td className="px-4 py-2">{ROLE_NAMES[m.roleId]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Unknown designations */}
              {migrationPreview.unknown.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-red-600 mb-2">Unknown / Unmapped Designations ({migrationPreview.unknown.length})</h4>
                  <div className="border border-red-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-red-50 sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-red-700">Name</th>
                          <th className="px-4 py-2 text-left font-medium text-red-700">Designation</th>
                          <th className="px-4 py-2 text-left font-medium text-red-700">User ID</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-red-100">
                        {migrationPreview.unknown.map((u) => (
                          <tr key={u.id}>
                            <td className="px-4 py-2">
                              <p className="font-medium text-red-900">{u.name || '—'}</p>
                              {u.email && <p className="text-xs text-red-600">{u.email}</p>}
                            </td>
                            <td className="px-4 py-2 text-red-700">{u.designation}</td>
                            <td className="px-4 py-2 text-red-600 font-mono text-xs">{u.id}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-secondary-200 bg-secondary-50 flex items-center justify-between gap-3">
              <p className="text-xs text-secondary-600">
                Review the report, then run the migration to apply it.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setMigrationPreviewOpen(false);
                    openMigrationRun();
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                >
                  <Play size={14} />
                  Run Migration
                </button>
                <button
                  onClick={() => setMigrationPreviewOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-secondary-700 bg-white border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Run Migration Modal */}
      {migrationRunOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-secondary-200">
              <div>
                <h3 className="text-lg font-semibold text-secondary-900">Run RBAC Migration</h3>
                <p className="text-xs text-secondary-500 mt-0.5">
                  {migrationResult ? 'Migration completed' : 'Review the plan and confirm to write to Firestore'}
                </p>
              </div>
              <button
                onClick={() => setMigrationRunOpen(false)}
                disabled={migrationRunning}
                className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors disabled:opacity-50"
              >
                <X size={18} className="text-secondary-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {migrationError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{migrationError}</div>
              )}

              {!migrationResult && migrationRunPlan && (
                <>
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                    This will write to Firestore. It creates/updates the five fixed role documents and adds
                    <code className="mx-1 px-1 py-0.5 bg-amber-100 rounded font-mono">roleId</code>
                    to users that do not have one. No other user field is modified and the legacy
                    <code className="mx-1 px-1 py-0.5 bg-amber-100 rounded font-mono">designation</code>
                    fallback remains in place.
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-secondary-900 mb-2">Role Documents</h4>
                    <div className="border border-secondary-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-secondary-50">
                          <tr>
                            <th className="px-4 py-2 text-left font-medium text-secondary-700">Role</th>
                            <th className="px-4 py-2 text-left font-medium text-secondary-700">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-secondary-100">
                          {migrationRunPlan.roleReports.map((role) => (
                            <tr key={role.roleId}>
                              <td className="px-4 py-2">
                                <span className="font-medium text-secondary-900">{ROLE_NAMES[role.roleId]}</span>
                                <span className="ml-2 text-xs text-secondary-500 font-mono">{role.roleId}</span>
                              </td>
                              <td className="px-4 py-2">
                                {role.needsCreate ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700">Create</span>
                                ) : role.needsUpdate ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-50 text-orange-700">Update permissions</span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary-100 text-secondary-600">No change</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="card p-4">
                      <p className="text-xs text-secondary-500">Total users</p>
                      <p className="text-2xl font-semibold text-secondary-900">{migrationRunPlan.totalUsers}</p>
                    </div>
                    <div className="card p-4">
                      <p className="text-xs text-secondary-500">Already have roleId</p>
                      <p className="text-2xl font-semibold text-secondary-900">{migrationRunPlan.alreadyHaveRoleId}</p>
                    </div>
                    <div className="card p-4">
                      <p className="text-xs text-secondary-500">Will migrate</p>
                      <p className="text-2xl font-semibold text-primary-600">{migrationRunPlan.willMigrate}</p>
                    </div>
                    <div className="card p-4">
                      <p className="text-xs text-secondary-500">Unknown / skipped</p>
                      <p className="text-2xl font-semibold text-red-600">{migrationRunPlan.unknown.length}</p>
                    </div>
                  </div>

                  {migrationRunPlan.unknown.length > 0 && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                      <p className="text-sm font-medium text-red-700 mb-1">
                        {migrationRunPlan.unknown.length} user(s) have unmapped designations and will NOT be migrated:
                      </p>
                      <ul className="text-xs text-red-600 space-y-0.5">
                        {migrationRunPlan.unknown.map((u) => (
                          <li key={u.id}>{u.name || u.id} — designation: "{u.designation}"</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}

              {migrationResult && (
                <>
                  <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">
                    Migration completed successfully.
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-secondary-900 mb-2">Role Documents</h4>
                    <ul className="text-sm text-secondary-700 space-y-1">
                      <li>Created: {migrationResult.rolesCreated.length > 0 ? migrationResult.rolesCreated.join(', ') : 'none'}</li>
                      <li>Updated: {migrationResult.rolesUpdated.length > 0 ? migrationResult.rolesUpdated.join(', ') : 'none'}</li>
                      <li>Already up-to-date: {migrationResult.rolesUpToDate.length > 0 ? migrationResult.rolesUpToDate.join(', ') : 'none'}</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-secondary-900 mb-2">
                      Users Migrated ({migrationResult.usersMigrated.length})
                    </h4>
                    {migrationResult.usersMigrated.length > 0 ? (
                      <div className="border border-secondary-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-secondary-50 sticky top-0">
                            <tr>
                              <th className="px-4 py-2 text-left font-medium text-secondary-700">Name</th>
                              <th className="px-4 py-2 text-left font-medium text-secondary-700">Designation</th>
                              <th className="px-4 py-2 text-left font-medium text-secondary-700">roleId</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-secondary-100">
                            {migrationResult.usersMigrated.map((m) => (
                              <tr key={m.id}>
                                <td className="px-4 py-2">
                                  <p className="font-medium text-secondary-900">{m.name || '—'}</p>
                                  {m.email && <p className="text-xs text-secondary-500">{m.email}</p>}
                                </td>
                                <td className="px-4 py-2">{m.designation}</td>
                                <td className="px-4 py-2 font-mono text-xs">{m.roleId}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-sm text-secondary-600">No users needed migration.</p>
                    )}
                    <p className="text-xs text-secondary-500 mt-2">
                      Skipped {migrationResult.usersSkipped} user(s) that already had a roleId.
                    </p>
                  </div>

                  {migrationResult.unknown.length > 0 && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                      <p className="text-sm font-medium text-red-700 mb-1">
                        {migrationResult.unknown.length} user(s) were NOT migrated (unknown designation):
                      </p>
                      <ul className="text-xs text-red-600 space-y-0.5">
                        {migrationResult.unknown.map((u) => (
                          <li key={u.id}>{u.name || u.id} — designation: "{u.designation}"</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="px-6 py-4 border-t border-secondary-200 bg-secondary-50 flex items-center justify-end gap-2">
              {!migrationResult ? (
                <>
                  <button
                    onClick={() => setMigrationRunOpen(false)}
                    disabled={migrationRunning}
                    className="px-4 py-2 text-sm font-medium text-secondary-700 bg-white border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={executeMigration}
                    disabled={migrationRunning}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-70"
                  >
                    {migrationRunning ? <RedSpinner size="sm" /> : <Play size={14} />}
                    {migrationRunning ? 'Running...' : 'Confirm & Run'}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setMigrationRunOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-secondary-700 bg-white border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
