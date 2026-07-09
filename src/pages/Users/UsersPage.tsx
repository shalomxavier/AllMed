import { useState, useEffect } from 'react';
import { ArrowLeft, RefreshCw, UserPlus, User, Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { doc, setDoc, getDocs, collection, query, orderBy, updateDoc } from 'firebase/firestore';
import { db, firebaseConfig } from '@/firebase/firebase';

interface Device {
  id: string;
  location: string;
  deviceId: string;
}

interface Employee {
  id: string;
  employeeCode?: string;
  employeeCodeInDevice?: string;
  employeeName?: string;
  branchManagerId?: string;
}

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
  const [branchOptions, setBranchOptions] = useState<string[]>([]);
  const [assignEmployeesModalOpen, setAssignEmployeesModalOpen] = useState(false);
  const [selectedBranchManager, setSelectedBranchManager] = useState<User | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set());
  const [assigningEmployees, setAssigningEmployees] = useState(false);
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState('');

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
    fetchDevices();
    fetchEmployees();
  }, []);

  const fetchDevices = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'devices'));
      const devicesData: Device[] = [];
      snapshot.forEach((doc) => {
        devicesData.push({ id: doc.id, ...doc.data() } as Device);
      });
      const locations = Array.from(new Set(devicesData.map((d) => d.location).filter(Boolean))).sort();
      setBranchOptions(locations);
    } catch (error) {
      console.error('Error fetching devices:', error);
    }
  };

  const fetchEmployees = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'employees'));
      const employeesData: Employee[] = [];
      snapshot.forEach((doc) => {
        employeesData.push({ id: doc.id, ...doc.data() } as Employee);
      });
      setEmployees(employeesData.filter((e) => !e.employeeCodeInDevice?.startsWith('Del')));
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  };

  const openAssignEmployeesModal = (user: User) => {
    setSelectedBranchManager(user);
    setSelectedEmployeeIds(new Set(employees.filter((e) => e.branchManagerId === user.id).map((e) => e.id)));
    setAssignEmployeesModalOpen(true);
  };

  const handleAssignEmployees = async () => {
    if (!selectedBranchManager) return;
    setAssigningEmployees(true);
    try {
      const batch = employees.map((emp) => {
        const isAssigned = selectedEmployeeIds.has(emp.id);
        const shouldUpdate = isAssigned !== (emp.branchManagerId === selectedBranchManager.id);
        if (shouldUpdate) {
          return updateDoc(doc(db, 'employees', emp.id), {
            branchManagerId: isAssigned ? selectedBranchManager.id : null,
          });
        }
        return Promise.resolve();
      });
      await Promise.all(batch);
      setAssignEmployeesModalOpen(false);
      setSelectedBranchManager(null);
      setSelectedEmployeeIds(new Set());
      fetchEmployees();
    } catch (error) {
      console.error('Error assigning employees:', error);
    } finally {
      setAssigningEmployees(false);
    }
  };

  const toggleEmployeeSelection = (employeeId: string) => {
    setSelectedEmployeeIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(employeeId)) {
        newSet.delete(employeeId);
      } else {
        newSet.add(employeeId);
      }
      return newSet;
    });
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

    if (!addUserForm.name || !addUserForm.email || !addUserForm.password || !addUserForm.designation || !addUserForm.branch) {
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
        branch: addUserForm.branch,
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

  return (
    <div className="flex flex-col h-full bg-secondary-50">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-secondary-200">
        <button onClick={() => navigate('/attendance')} className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors">
          <ArrowLeft size={20} className="text-secondary-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-semibold text-secondary-900">Users</h1>
          <p className="text-xs text-secondary-500">Manage application users</p>
        </div>
        <button onClick={fetchUsers} className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors">
          <RefreshCw size={18} className={`text-secondary-500 ${loading ? 'animate-spin' : ''}`} />
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
            <div className="w-7 h-7 border-2 border-secondary-300 border-t-red-600 rounded-full animate-spin" />
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
            <div key={user.id} className="bg-white border border-secondary-200 rounded-lg p-5 hover:shadow-sm transition-shadow flex flex-col">
              <div className="flex items-start mb-3">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <User className="w-6 h-6 text-red-600" />
                </div>
              </div>
              <h3 className="font-semibold text-secondary-900 mb-1">{user.name}</h3>
              <div className="space-y-1 text-sm text-secondary-600 flex-1">
                <p><span className="font-medium">Email:</span> {user.email}</p>
                <p><span className="font-medium">Branch:</span> {user.branch}</p>
                <p><span className="font-medium">Designation:</span> {user.designation}</p>
              </div>
              <div className="flex flex-col gap-2 mt-3">
                {user.designation === 'Branch Manager' && (
                  <button onClick={() => openAssignEmployeesModal(user)} className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
                    <UserPlus size={16} />
                    Employees
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

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
                  onChange={(e) => setAddUserForm({ ...addUserForm, designation: e.target.value })}
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

      {/* Assign Employees Modal */}
      {assignEmployeesModalOpen && selectedBranchManager && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-secondary-900">Assign Employees</h3>
                <p className="text-sm text-secondary-500">Assign employees to {selectedBranchManager.name}</p>
              </div>
              <button onClick={() => setAssignEmployeesModalOpen(false)} className="p-1.5 rounded-lg hover:bg-secondary-100 transition-colors">
                <X size={18} className="text-secondary-500" />
              </button>
            </div>

            <div className="mb-4">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400" />
                <input
                  type="text"
                  placeholder="Search employees..."
                  value={employeeSearchQuery}
                  onChange={(e) => setEmployeeSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-secondary-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-red-300"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto mb-4">
              {employees.length === 0 ? (
                <div className="text-center py-8 text-secondary-500">No employees found</div>
              ) : (
                <div className="space-y-2">
                  {employees
                    .filter((employee) => {
                      const searchLower = employeeSearchQuery.toLowerCase();
                      const name = (employee.employeeName || '').toLowerCase();
                      const code = (employee.employeeCode || employee.employeeCodeInDevice || '').toLowerCase();
                      return name.includes(searchLower) || code.includes(searchLower);
                    })
                    .sort((a, b) => {
                      const aSelected = selectedEmployeeIds.has(a.id);
                      const bSelected = selectedEmployeeIds.has(b.id);
                      if (aSelected && !bSelected) return -1;
                      if (!aSelected && bSelected) return 1;
                      return 0;
                    })
                    .map((employee) => (
                    <div
                      key={employee.id}
                      onClick={() => toggleEmployeeSelection(employee.id)}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                        selectedEmployeeIds.has(employee.id) ? 'bg-red-50 border border-red-200' : 'bg-secondary-50 border border-secondary-200 hover:bg-secondary-100'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                        selectedEmployeeIds.has(employee.id) ? 'bg-red-600 border-red-600' : 'border-secondary-300'
                      }`}>
                        {selectedEmployeeIds.has(employee.id) && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-secondary-900">{employee.employeeName || 'Unknown'}</p>
                        <p className="text-xs text-secondary-500">ID: {employee.employeeCode || employee.employeeCodeInDevice || 'N/A'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setAssignEmployeesModalOpen(false)}
                className="flex-1 px-4 py-2 text-sm font-medium text-secondary-700 bg-secondary-100 rounded-lg hover:bg-secondary-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignEmployees}
                disabled={assigningEmployees}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-70"
              >
                {assigningEmployees ? 'Assigning...' : `Assign (${selectedEmployeeIds.size})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
