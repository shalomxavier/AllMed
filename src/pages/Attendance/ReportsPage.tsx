import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Eye } from 'lucide-react';
import { collection, getDocs, getFirestore, query, where } from 'firebase/firestore';
import { exportAttendanceReport, exportDailyAttendanceRecords, exportShiftReport } from '@/utils/attendanceExport';
import { useAuthContext } from '@/contexts/AuthContext';

export const ReportsPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, userData } = useAuthContext();
  const [monthlyFromDate, setMonthlyFromDate] = useState('');
  const [monthlyToDate, setMonthlyToDate] = useState('');
  const [monthlyLocation, setMonthlyLocation] = useState('');
  const [dailyFromDate, setDailyFromDate] = useState('');
  const [dailyToDate, setDailyToDate] = useState('');
  const [dailyLocation, setDailyLocation] = useState('');
  const [shiftFromDate, setShiftFromDate] = useState('');
  const [shiftToDate, setShiftToDate] = useState('');
  const [shiftLocation, setShiftLocation] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportingDaily, setExportingDaily] = useState(false);
  const [exportingShift, setExportingShift] = useState(false);
  const [branchOptions, setBranchOptions] = useState<string[]>([]);
  const [managerBranchName, setManagerBranchName] = useState<string | null>(null);

  useEffect(() => {
    const resolveBranches = async () => {
      const db = getFirestore();
      if (userData?.designation === 'Branch Manager' && currentUser) {
        try {
          const branchQuery = query(collection(db, 'branches'), where('managerId', '==', currentUser.uid));
          const branchSnapshot = await getDocs(branchQuery);
          const branchName = branchSnapshot.empty ? '' : (branchSnapshot.docs[0].data().name || '');
          setManagerBranchName(branchName);
          setMonthlyLocation(branchName);
          setDailyLocation(branchName);
          setShiftLocation(branchName);
        } catch (err) {
          console.error('Error resolving manager branch:', err);
          setManagerBranchName('');
        }
      } else {
        try {
          const branchesSnapshot = await getDocs(collection(db, 'branches'));
          setBranchOptions(branchesSnapshot.docs.map((b) => b.data().name).filter(Boolean).sort());
        } catch (err) {
          console.error('Error fetching branches list:', err);
        }
      }
    };
    resolveBranches();
  }, [currentUser, userData]);

  useEffect(() => {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    const from = formatDate(firstDayOfMonth);
    const to = formatDate(today);
    setMonthlyFromDate(from);
    setMonthlyToDate(to);
    setDailyFromDate(from);
    setDailyToDate(to);
    setShiftFromDate(from);
    setShiftToDate(to);
  }, []);

  const handleExport = async () => {
    if (!monthlyFromDate || !monthlyToDate) return;
    setExporting(true);
    try {
      await exportAttendanceReport(monthlyFromDate, monthlyToDate, monthlyLocation);
    } finally {
      setExporting(false);
    }
  };

  const handleView = () => {
    if (!monthlyFromDate || !monthlyToDate) return;
    const params = new URLSearchParams({
      from: monthlyFromDate,
      to: monthlyToDate,
      location: monthlyLocation,
    });
    window.open(`/attendance/reports/preview/monthly?${params.toString()}`, '_blank');
  };

  const handleDailyExport = async () => {
    if (!dailyFromDate || !dailyToDate) return;
    setExportingDaily(true);
    try {
      await exportDailyAttendanceRecords(dailyFromDate, dailyToDate, dailyLocation);
    } finally {
      setExportingDaily(false);
    }
  };

  const handleDailyView = () => {
    if (!dailyFromDate || !dailyToDate) return;
    const params = new URLSearchParams({
      from: dailyFromDate,
      to: dailyToDate,
      location: dailyLocation,
    });
    window.open(`/attendance/reports/preview/daily?${params.toString()}`, '_blank');
  };

  const handleShiftExport = async () => {
    if (!shiftFromDate || !shiftToDate) return;
    setExportingShift(true);
    try {
      await exportShiftReport(shiftFromDate, shiftToDate, shiftLocation);
    } finally {
      setExportingShift(false);
    }
  };

  const handleShiftView = () => {
    if (!shiftFromDate || !shiftToDate) return;
    const params = new URLSearchParams({
      from: shiftFromDate,
      to: shiftToDate,
      location: shiftLocation,
    });
    window.open(`/attendance/reports/preview/shifts?${params.toString()}`, '_blank');
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-6 py-4">
        <button
          onClick={() => navigate('/attendance')}
          className="p-1.5 rounded-lg text-secondary-500 hover:text-secondary-900 hover:bg-secondary-100 transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-secondary-900">Reports</h1>
          <p className="text-sm text-secondary-500">Attendance reports</p>
        </div>
      </div>
      <div className="p-6 flex-1">
        <div className="max-w-2xl space-y-6">
          {/* Monthly Work Duration */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 shadow-lg">
            <h2 className="text-lg font-medium text-secondary-900 mb-2">Monthly Work Duration</h2>
            <p className="text-sm text-secondary-500 mb-4">Generate monthly work duration report.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <label htmlFor="monthlyFromDate" className="block text-sm font-medium text-secondary-700 mb-1">From Date</label>
                <input
                  id="monthlyFromDate"
                  type="date"
                  value={monthlyFromDate}
                  onChange={(e) => setMonthlyFromDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="monthlyToDate" className="block text-sm font-medium text-secondary-700 mb-1">To Date</label>
                <input
                  id="monthlyToDate"
                  type="date"
                  value={monthlyToDate}
                  onChange={(e) => setMonthlyToDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="monthlyLocation" className="block text-sm font-medium text-secondary-700 mb-1">Branch</label>
                <select
                  id="monthlyLocation"
                  value={monthlyLocation}
                  onChange={(e) => setMonthlyLocation(e.target.value)}
                  disabled={userData?.designation === 'Branch Manager'}
                  className="w-full px-3 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-secondary-100 disabled:cursor-not-allowed"
                >
                  {userData?.designation === 'Branch Manager' ? (
                    <option value={managerBranchName ?? ''}>{managerBranchName || 'No branch assigned'}</option>
                  ) : (
                    <>
                      <option value="">All Branches</option>
                      {branchOptions.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </>
                  )}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleView}
                disabled={!monthlyFromDate || !monthlyToDate}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-pink-700 bg-pink-50 border border-pink-200 rounded-lg hover:bg-pink-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Eye size={16} />
                View Monthly Report
              </button>
              <button
                onClick={handleExport}
                disabled={!monthlyFromDate || !monthlyToDate || exporting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-pink-600 rounded-lg hover:bg-pink-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={16} />
                {exporting ? 'Exporting...' : 'Export Monthly Report'}
              </button>
            </div>
          </div>

          {/* Daily Attendance */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 shadow-lg">
            <h2 className="text-lg font-medium text-secondary-900 mb-2">Daily Attendance</h2>
            <p className="text-sm text-secondary-500 mb-4">Export daily attendance records.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <label htmlFor="dailyFromDate" className="block text-sm font-medium text-secondary-700 mb-1">From Date</label>
                <input
                  id="dailyFromDate"
                  type="date"
                  value={dailyFromDate}
                  onChange={(e) => setDailyFromDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="dailyToDate" className="block text-sm font-medium text-secondary-700 mb-1">To Date</label>
                <input
                  id="dailyToDate"
                  type="date"
                  value={dailyToDate}
                  onChange={(e) => setDailyToDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="dailyLocation" className="block text-sm font-medium text-secondary-700 mb-1">Branch</label>
                <select
                  id="dailyLocation"
                  value={dailyLocation}
                  onChange={(e) => setDailyLocation(e.target.value)}
                  disabled={userData?.designation === 'Branch Manager'}
                  className="w-full px-3 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-secondary-100 disabled:cursor-not-allowed"
                >
                  {userData?.designation === 'Branch Manager' ? (
                    <option value={managerBranchName ?? ''}>{managerBranchName || 'No branch assigned'}</option>
                  ) : (
                    <>
                      <option value="">All Branches</option>
                      {branchOptions.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </>
                  )}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleDailyView}
                disabled={!dailyFromDate || !dailyToDate}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-pink-700 bg-pink-50 border border-pink-200 rounded-lg hover:bg-pink-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Eye size={16} />
                View Attendance Log
              </button>
              <button
                onClick={handleDailyExport}
                disabled={!dailyFromDate || !dailyToDate || exportingDaily}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-pink-600 rounded-lg hover:bg-pink-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={16} />
                {exportingDaily ? 'Exporting...' : 'Export Attendance Log'}
              </button>
            </div>
          </div>

          {/* Shifts */}
          <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 shadow-lg">
            <h2 className="text-lg font-medium text-secondary-900 mb-2">Shifts</h2>
            <p className="text-sm text-secondary-500 mb-4">Export shift assignment report.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <label htmlFor="shiftFromDate" className="block text-sm font-medium text-secondary-700 mb-1">From Date</label>
                <input
                  id="shiftFromDate"
                  type="date"
                  value={shiftFromDate}
                  onChange={(e) => setShiftFromDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="shiftToDate" className="block text-sm font-medium text-secondary-700 mb-1">To Date</label>
                <input
                  id="shiftToDate"
                  type="date"
                  value={shiftToDate}
                  onChange={(e) => setShiftToDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="shiftLocation" className="block text-sm font-medium text-secondary-700 mb-1">Branch</label>
                <select
                  id="shiftLocation"
                  value={shiftLocation}
                  onChange={(e) => setShiftLocation(e.target.value)}
                  disabled={userData?.designation === 'Branch Manager'}
                  className="w-full px-3 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-secondary-100 disabled:cursor-not-allowed"
                >
                  {userData?.designation === 'Branch Manager' ? (
                    <option value={managerBranchName ?? ''}>{managerBranchName || 'No branch assigned'}</option>
                  ) : (
                    <>
                      <option value="">All Branches</option>
                      {branchOptions.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </>
                  )}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleShiftView}
                disabled={!shiftFromDate || !shiftToDate}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-pink-700 bg-pink-50 border border-pink-200 rounded-lg hover:bg-pink-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Eye size={16} />
                View Shift Report
              </button>
              <button
                onClick={handleShiftExport}
                disabled={!shiftFromDate || !shiftToDate || exportingShift}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-pink-600 rounded-lg hover:bg-pink-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={16} />
                {exportingShift ? 'Exporting...' : 'Export Shift Report'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
