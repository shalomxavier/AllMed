import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/firebase/firebase';
import { exportAttendanceReport, exportDailyAttendanceRecords } from '@/utils/attendanceExport';

export const ReportsPage: React.FC = () => {
  const navigate = useNavigate();
  const [monthlyFromDate, setMonthlyFromDate] = useState('');
  const [monthlyToDate, setMonthlyToDate] = useState('');
  const [monthlyLocation, setMonthlyLocation] = useState('');
  const [dailyFromDate, setDailyFromDate] = useState('');
  const [dailyToDate, setDailyToDate] = useState('');
  const [dailyLocation, setDailyLocation] = useState('');
  const [locations, setLocations] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportingDaily, setExportingDaily] = useState(false);

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
  }, []);

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'devices'));
        const locs = new Set<string>();
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data.location) locs.add(data.location);
        });
        setLocations(Array.from(locs).sort());
      } catch (error) {
        console.error('Error fetching devices:', error);
      }
    };
    fetchDevices();
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

  const handleDailyExport = async () => {
    if (!dailyFromDate || !dailyToDate) return;
    setExportingDaily(true);
    try {
      await exportDailyAttendanceRecords(dailyFromDate, dailyToDate, dailyLocation);
    } finally {
      setExportingDaily(false);
    }
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-secondary-200 bg-white">
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
      <div className="bg-secondary-50 p-6 flex-1">
        <div className="max-w-2xl space-y-6">
          {/* Monthly Work Duration */}
          <div className="bg-white rounded-xl border border-secondary-200 p-6 shadow-sm">
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
                <label htmlFor="monthlyLocation" className="block text-sm font-medium text-secondary-700 mb-1">Location</label>
                <select
                  id="monthlyLocation"
                  value={monthlyLocation}
                  onChange={(e) => setMonthlyLocation(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="">All Locations</option>
                  {locations.map((loc) => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={handleExport}
              disabled={!monthlyFromDate || !monthlyToDate || exporting}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-pink-600 rounded-lg hover:bg-pink-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download size={16} />
              {exporting ? 'Exporting...' : 'Export Monthly Report'}
            </button>
          </div>

          {/* Daily Attendance */}
          <div className="bg-white rounded-xl border border-secondary-200 p-6 shadow-sm">
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
                <label htmlFor="dailyLocation" className="block text-sm font-medium text-secondary-700 mb-1">Location</label>
                <select
                  id="dailyLocation"
                  value={dailyLocation}
                  onChange={(e) => setDailyLocation(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="">All Locations</option>
                  {locations.map((loc) => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
              </div>
            </div>
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
      </div>
    </div>
  );
}
