import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save, X, Edit } from 'lucide-react';
import { getFirestore, doc, getDoc, updateDoc, collection, getDocs } from 'firebase/firestore';

interface Employee {
  id: string;
  employeeCode?: string;
  employeeCodeInDevice?: string;
  employeeId?: string;
  employeeName?: string;
  designation?: string;
  subDesignation?: string;
  officialEmail?: string;
  username?: string;
  loginId?: string;
  dateOfJoining?: string;
  employmentType?: string;
  department?: string;
  grade?: string;
  group?: string;
  reportingManager?: string;
  workLocation?: string;
  probationPeriod?: string;
  confirmationDate?: string;
  employmentStatus?: string;
  syncedAt?: any;
}

const employmentFields: Array<{ key: keyof Employee; label: string; type?: string }> = [
  { key: 'officialEmail', label: 'Official Email', type: 'email' },
  { key: 'username', label: 'Username' },
  { key: 'loginId', label: 'Login ID' },
  { key: 'dateOfJoining', label: 'Date of Joining', type: 'date' },
  { key: 'employmentType', label: 'Employment Type' },
  { key: 'department', label: 'Department' },
  { key: 'designation', label: 'Designation' },
  { key: 'subDesignation', label: 'Sub Designation' },
  { key: 'grade', label: 'Grade' },
  { key: 'group', label: 'Group' },
  { key: 'reportingManager', label: 'Reporting Manager' },
  { key: 'workLocation', label: 'Work Location / Branch' },
  { key: 'probationPeriod', label: 'Probation Period' },
  { key: 'confirmationDate', label: 'Confirmation Date', type: 'date' },
  { key: 'employmentStatus', label: 'Employment Status' },
];

export const EmployeeDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isEditing = searchParams.get('edit') === 'true';

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [employmentDetails, setEmploymentDetails] = useState<Partial<Employee>>({});
  const [saving, setSaving] = useState(false);
  const [designations, setDesignations] = useState<{ name: string; subDesignations: string[] }[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);

  const fetchEmployee = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const db = getFirestore();
      const snapshot = await getDoc(doc(db, 'employees', id));
      if (snapshot.exists()) {
        const data = { id: snapshot.id, ...snapshot.data() } as Employee;
        setEmployee(data);
        setEmploymentDetails(data);
      } else {
        setNotFound(true);
      }
    } catch (error) {
      console.error('Error fetching employee:', error);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  const fetchOptions = async () => {
    try {
      const db = getFirestore();
      const [designationsSnapshot, departmentsSnapshot] = await Promise.all([
        getDocs(collection(db, 'designations')),
        getDocs(collection(db, 'departments')),
      ]);
      setDesignations(
        designationsSnapshot.docs
          .map((d) => {
            const data = d.data();
            return {
              name: data.name,
              subDesignations: Array.isArray(data.subDesignations) ? data.subDesignations : [],
            };
          })
          .filter((d) => d.name)
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setDepartments(
        departmentsSnapshot.docs.map((d) => d.data().name).filter(Boolean).sort()
      );
    } catch (error) {
      console.error('Error fetching options:', error);
    }
  };

  useEffect(() => {
    fetchEmployee();
    fetchOptions();
  }, [id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee || !id) return;
    setSaving(true);
    try {
      const db = getFirestore();
      const updates = Object.fromEntries(
        employmentFields.map(({ key }) => [key, employmentDetails[key] || ''])
      );
      await updateDoc(doc(db, 'employees', id), updates);
      setEmployee({ ...employee, ...updates });
      setSearchParams({});
    } catch (error) {
      console.error('Error updating employee:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setSearchParams({});
    if (employee) setEmploymentDetails(employee);
  };

  const formatDate = (value: any) => {
    if (!value) return '—';
    if (value.toDate) return value.toDate().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    if (value instanceof Date) return value.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    return String(value);
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-secondary-200 bg-white">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/attendance/employees')}
            className="p-1.5 rounded-lg text-secondary-500 hover:text-secondary-900 hover:bg-secondary-100 transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-secondary-900">
              {isEditing ? 'Edit Employee' : 'Employee Details'}
            </h1>
            <p className="text-sm text-secondary-500">
              {employee?.employeeName || 'View employee information'}
            </p>
          </div>
        </div>
        {!isEditing && employee && (
          <button
            onClick={() => setSearchParams({ edit: 'true' })}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <Edit size={16} />
            Edit
          </button>
        )}
      </div>

      <div className="bg-secondary-50 p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-secondary-300 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : notFound || !employee ? (
          <div className="text-center py-12 text-secondary-600">
            Employee not found.
          </div>
        ) : isEditing ? (
          <form onSubmit={handleSave} className="max-w-2xl bg-white rounded-xl border border-secondary-200 p-6 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">Employee Name</label>
                <p className="text-sm text-secondary-900 bg-secondary-50 px-3 py-2 rounded-lg">
                  {employee.employeeName || '—'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">Employee ID</label>
                <p className="text-sm text-secondary-900 bg-secondary-50 px-3 py-2 rounded-lg">
                  {employee.employeeId || '—'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">Employee Code</label>
                <p className="text-sm text-secondary-900 bg-secondary-50 px-3 py-2 rounded-lg">
                  {employee.employeeCode || '—'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">Device Code</label>
                <p className="text-sm text-secondary-900 bg-secondary-50 px-3 py-2 rounded-lg">
                  {employee.employeeCodeInDevice || '—'}
                </p>
              </div>
              {employmentFields.map(({ key, label, type = 'text' }) => {
                const isSubDesignation = key === 'subDesignation';
                const currentDesignation = designations.find(
                  (d) => d.name === employmentDetails.designation
                );
                const subDesignationOptions = currentDesignation?.subDesignations || [];

                return (
                  <div key={key}>
                    <label htmlFor={key} className="block text-sm font-medium text-secondary-700 mb-1">
                      {label}
                    </label>
                    {key === 'employmentType' || key === 'employmentStatus' || key === 'department' || key === 'designation' || isSubDesignation ? (
                      <select
                        id={key}
                        value={employmentDetails[key] || ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (key === 'designation') {
                            setEmploymentDetails({
                              ...employmentDetails,
                              designation: value,
                              subDesignation: '',
                            });
                          } else {
                            setEmploymentDetails({ ...employmentDetails, [key]: value });
                          }
                        }}
                        disabled={isSubDesignation && subDesignationOptions.length === 0}
                        className="w-full px-3 py-2 text-sm text-secondary-900 border border-secondary-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-secondary-100 disabled:text-secondary-400"
                      >
                        <option value="">{isSubDesignation && subDesignationOptions.length === 0 ? 'No sub designations' : `Select ${label}`}</option>
                        {(
                          key === 'employmentType'
                            ? ['Permanent', 'Contract', 'Intern']
                            : key === 'employmentStatus'
                            ? ['Active', 'Inactive']
                            : key === 'department'
                            ? departments
                            : key === 'designation'
                            ? designations.map((d) => d.name)
                            : subDesignationOptions
                        ).map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={key}
                        type={type}
                        value={employmentDetails[key] || ''}
                        onChange={(e) => setEmploymentDetails({ ...employmentDetails, [key]: e.target.value })}
                        className="w-full px-3 py-2 text-sm text-secondary-900 border border-secondary-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder={`Enter ${label.toLowerCase()}`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 text-sm font-medium text-secondary-700 bg-secondary-100 rounded-lg hover:bg-secondary-200 transition-colors"
              >
                <X size={16} className="inline mr-1" />
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={16} className="inline mr-1" />
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        ) : (
          <div className="max-w-2xl bg-white rounded-xl border border-secondary-200 p-6 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm font-medium text-secondary-500 mb-1">Employee Name</p>
                <p className="text-base text-secondary-900">{employee.employeeName || '—'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-secondary-500 mb-1">Employee ID</p>
                <p className="text-base text-secondary-900">{employee.employeeId || '—'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-secondary-500 mb-1">Employee Code</p>
                <p className="text-base text-secondary-900">{employee.employeeCode || '—'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-secondary-500 mb-1">Device Code</p>
                <p className="text-base text-secondary-900">{employee.employeeCodeInDevice || '—'}</p>
              </div>
              {employmentFields.map(({ key, label }) => (
                <div key={key}>
                  <p className="text-sm font-medium text-secondary-500 mb-1">{label}</p>
                  <p className="text-base text-secondary-900">{employee[key] || '—'}</p>
                </div>
              ))}
              <div>
                <p className="text-sm font-medium text-secondary-500 mb-1">Last Synced</p>
                <p className="text-base text-secondary-900">{formatDate(employee.syncedAt)}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
