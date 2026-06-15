import { useState, useEffect } from 'react';
import { ArrowLeft, Search, RefreshCw, Users, Clock, Plus, Edit, Eye, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getFirestore, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { useAuthContext } from '@/contexts/AuthContext';

interface Employee {
  id: string;
  employeeCode?: string;
  employeeCodeInDevice?: string;
  employeeId?: string;
  employeeName?: string;
  syncedAt?: any;
}

export const EmployeesPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuthContext();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const fetchEmployees = async () => {
    if (!currentUser) return;
    
    try {
      const db = getFirestore();
      const employeesRef = collection(db, 'employees');
      const q = query(employeesRef, orderBy('employeeName'));
      const snapshot = await getDocs(q);
      
      const employeesData: Employee[] = [];
      snapshot.forEach((doc) => {
        employeesData.push({
          id: doc.id,
          ...doc.data(),
        });
      });
      
      setEmployees(employeesData);
    } catch (error) {
      console.error('Error fetching employees:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, [currentUser]);

  const filteredEmployees = employees.filter((emp) => {
    // Exclude employees with device code starting with "Del"
    if (emp.employeeCodeInDevice?.startsWith('Del')) {
      return false;
    }

    const searchLower = searchQuery.toLowerCase();
    return (
      emp.employeeName?.toLowerCase().includes(searchLower) ||
      emp.employeeCode?.toLowerCase().includes(searchLower) ||
      emp.employeeId?.toLowerCase().includes(searchLower)
    );
  });

  const handleShiftsClick = (employee: Employee) => {
    setSelectedEmployee(employee);
    setShiftModalOpen(true);
  };

  const handleShiftAction = (action: 'view' | 'add' | 'edit') => {
    // TODO: Implement action logic
    console.log(`Action: ${action} for employee: ${selectedEmployee?.employeeName}`);
  };

  const closeModal = () => {
    setShiftModalOpen(false);
    setSelectedEmployee(null);
  };

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
            <h1 className="text-xl font-semibold text-secondary-900">Employees</h1>
            <p className="text-sm text-secondary-500">
              View and manage employee records
            </p>
          </div>
        </div>
        <button
          onClick={fetchEmployees}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-secondary-700 bg-white border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto bg-secondary-50 p-6">
        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-400" />
            <input
              type="text"
              placeholder="Search employees by name, code, or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Employees Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-secondary-300 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center mb-4">
              <Users className="w-10 h-10 text-blue-600" />
            </div>
            <h3 className="text-lg font-medium text-secondary-900 mb-2">
              {searchQuery ? 'No employees found' : 'No employees yet'}
            </h3>
            <p className="text-sm text-secondary-500 max-w-sm">
              {searchQuery
                ? 'Try adjusting your search terms'
                : 'Employee records will appear here once they are added to the system.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredEmployees.map((employee) => (
              <div
                key={employee.id}
                className="card p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start mb-3">
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                    <Users className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
                <h3 className="font-semibold text-secondary-900 mb-1">
                  {employee.employeeName || 'Unknown'}
                </h3>
                <div className="space-y-1 text-sm text-secondary-600">
                  {employee.employeeId && (
                    <p>
                      <span className="font-medium">ID:</span> {employee.employeeId}
                    </p>
                  )}
                  {employee.employeeCodeInDevice && (
                    <p>
                      <span className="font-medium">Device Code:</span> {employee.employeeCodeInDevice}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleShiftsClick(employee)}
                  className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  <Clock size={16} />
                  Shifts
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Stats */}
        {!loading && employees.length > 0 && (
          <div className="mt-6 text-sm text-secondary-500">
            Showing {filteredEmployees.length} of {employees.length} employees
          </div>
        )}
      </div>

      {/* Shift Modal */}
      {shiftModalOpen && selectedEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-secondary-200">
              <h2 className="text-lg font-semibold text-secondary-900">
                Shift Management
              </h2>
              <button
                onClick={closeModal}
                className="p-1.5 rounded-lg text-secondary-500 hover:text-secondary-900 hover:bg-secondary-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4">
              <p className="text-sm text-secondary-600 mb-4">
                Employee: <span className="font-medium text-secondary-900">{selectedEmployee.employeeName}</span>
              </p>
              <div className="space-y-2">
                <button
                  onClick={() => handleShiftAction('view')}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg border border-secondary-200 hover:bg-secondary-50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <Eye size={20} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-secondary-900">View Shifts</p>
                    <p className="text-sm text-secondary-500">View existing shift records</p>
                  </div>
                </button>
                <button
                  onClick={() => handleShiftAction('add')}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg border border-secondary-200 hover:bg-secondary-50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                    <Plus size={20} className="text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium text-secondary-900">Add Shift</p>
                    <p className="text-sm text-secondary-500">Create a new shift assignment</p>
                  </div>
                </button>
                <button
                  onClick={() => handleShiftAction('edit')}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg border border-secondary-200 hover:bg-secondary-50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                    <Edit size={20} className="text-orange-600" />
                  </div>
                  <div>
                    <p className="font-medium text-secondary-900">Edit Shift</p>
                    <p className="text-sm text-secondary-500">Modify existing shift details</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
