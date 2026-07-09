import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Search, RefreshCw, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, orderBy, limit, startAfter, where, Timestamp, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { db } from '@/firebase/firebase';
import { useAuthContext } from '@/contexts/AuthContext';

interface RawPunch {
  id: string;
  deviceId?: number;
  deviceLogId?: string;
  direction?: string;
  logDate?: any;
  month?: number;
  sourceTable?: string;
  userId?: string;
  verificationMode?: string;
  year?: number;
}

const PAGE_SIZE = 50;

const toDate = (logDate: any): Date | null => {
  if (!logDate) return null;
  if (logDate?.toDate) return logDate.toDate();
  if (logDate instanceof Date) return logDate;
  return null;
};

const formatDate = (logDate: any): string => {
  const d = toDate(logDate);
  if (!d) return '—';
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const year = d.getUTCFullYear();
  return `${day}-${month}-${year}`;
};

const formatTime = (logDate: any): string => {
  const d = toDate(logDate);
  if (!d) return '—';
  const hours = d.getUTCHours();
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const seconds = String(d.getUTCSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  const displayHours = hours % 12 || 12;
  return `${String(displayHours).padStart(2, '0')}:${minutes}:${seconds} ${ampm}`;
};

const SEARCH_LIMIT = 1000;

export const RawPunchesPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, userData } = useAuthContext();

  const [allPunches, setAllPunches] = useState<RawPunch[]>([]);
  const [allowedUserIds, setAllowedUserIds] = useState<Set<string>>(new Set());
  const [isBranchManager, setIsBranchManager] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [employeeMap, setEmployeeMap] = useState<Record<string, string>>({});
  const [devicesMap, setDevicesMap] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [shiftsMap, setShiftsMap] = useState<Record<string, any[]>>({});
  const [employeesLoaded, setEmployeesLoaded] = useState(false);
  const [locationFilter, setLocationFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDateFilter, setToDateFilter] = useState('');
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const activeFilters = useRef({ fromDate: '', toDateFilter: '', locationFilter: '' });

  useEffect(() => {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const formatDateLocal = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    setFromDate(formatDateLocal(firstDayOfMonth));
    setToDateFilter(formatDateLocal(today));
  }, []);

  const getDeviceIdsForLocation = (loc: string): number[] => {
    if (!loc) return [];
    return Object.entries(devicesMap)
      .filter(([, locationName]) => locationName === loc)
      .map(([deviceId]) => Number(deviceId))
      .filter((id) => !isNaN(id));
  };

  const buildQueryConstraints = (from: string, to: string, deviceIds: number[], cursor?: QueryDocumentSnapshot<DocumentData>) => {
    const constraints: any[] = [orderBy('logDate', 'desc')];
    if (from) {
      const fromTs = Timestamp.fromDate(new Date(from + 'T00:00:00'));
      constraints.push(where('logDate', '>=', fromTs));
    }
    if (to) {
      const toTs = Timestamp.fromDate(new Date(to + 'T23:59:59'));
      constraints.push(where('logDate', '<=', toTs));
    }
    if (deviceIds.length > 0) {
      constraints.push(where('deviceId', 'in', deviceIds.slice(0, 30)));
    }
    if (cursor) constraints.push(startAfter(cursor));
    constraints.push(limit(SEARCH_LIMIT));
    return constraints;
  };

  const applyBranchFilter = (data: RawPunch[]) =>
    isBranchManager ? data.filter((p) => p.userId && allowedUserIds.has(p.userId.trim().toLowerCase())) : data;

  const fetchPage = async (from = fromDate, to = toDateFilter, loc = locationFilter) => {
    if (!currentUser) return;
    activeFilters.current = { fromDate: from, toDateFilter: to, locationFilter: loc };
    setLoading(true);
    try {
      const deviceIds = getDeviceIdsForLocation(loc);
      const constraints = buildQueryConstraints(from, to, deviceIds);
      const snapshot = await getDocs(query(collection(db, 'rawPunches'), ...constraints));
      console.log('[fetchPage] docs returned:', snapshot.docs.length, 'hasMore:', snapshot.docs.length === SEARCH_LIMIT);
      let data: RawPunch[] = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      data = applyBranchFilter(data);
      setAllPunches(data);
      setLastDoc(snapshot.docs[snapshot.docs.length - 1] ?? null);
      setHasMore(snapshot.docs.length === SEARCH_LIMIT);
      setCurrentPageIndex(0);
    } catch (error) {
      console.error('Error fetching rawPunches:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMorePunches = async () => {
    if (!currentUser || !lastDoc || loadingMore) return;
    const { fromDate: from, toDateFilter: to, locationFilter: loc } = activeFilters.current;
    setLoadingMore(true);
    try {
      const deviceIds = getDeviceIdsForLocation(loc);
      const constraints = buildQueryConstraints(from, to, deviceIds, lastDoc);
      const snapshot = await getDocs(query(collection(db, 'rawPunches'), ...constraints));
      let data: RawPunch[] = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      data = applyBranchFilter(data);
      setAllPunches((prev) => {
        const merged = [...prev, ...data];
        setCurrentPageIndex(Math.floor(prev.length / PAGE_SIZE));
        return merged;
      });
      setLastDoc(snapshot.docs[snapshot.docs.length - 1] ?? null);
      setHasMore(snapshot.docs.length === SEARCH_LIMIT);
    } catch (error) {
      console.error('Error fetching more rawPunches:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    setEmployeesLoaded(false);
    fetchEmployees();
    fetchShifts();
    fetchDevices();
  }, [currentUser, userData]);

  useEffect(() => {
    if (!currentUser || !employeesLoaded) return;
    fetchPage(fromDate, toDateFilter, locationFilter);
  }, [currentUser, employeesLoaded]);

  useEffect(() => {
    if (!currentUser || !employeesLoaded) return;
    setLastDoc(null);
    setHasMore(false);
    fetchPage(fromDate, toDateFilter, locationFilter);
  }, [fromDate, toDateFilter, locationFilter]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setCurrentPageIndex(0);
  }, [debouncedSearch, fromDate, toDateFilter, locationFilter]);


  const fetchEmployees = async () => {
    if (!currentUser) return;
    try {
      const snapshot = await getDocs(collection(db, 'employees'));
      const map: Record<string, string> = {};
      const allowedIds = new Set<string>();
      snapshot.forEach((doc) => {
        const data = doc.data();
        const key = (data.employeeCodeInDevice ?? '').toString().trim().toLowerCase();
        if (key) {
          map[key] = data.employeeName ?? '';
          if (userData?.designation === 'Branch Manager' && data.branchManagerId === userData.id) {
            allowedIds.add(key);
          }
        }
      });
      setEmployeeMap(map);
      setAllowedUserIds(allowedIds);
      setIsBranchManager(userData?.designation === 'Branch Manager');
      setEmployeesLoaded(true);
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  };

  const fetchShifts = async () => {
    if (!currentUser) return;
    try {
      const snapshot = await getDocs(collection(db, 'shifts'));
      const map: Record<string, any[]> = {};
      snapshot.forEach((doc) => {
        const data = doc.data();
        const employees: any[] = data.employees ?? [];
        employees.forEach((emp) => {
          const code = (emp.employeeCode ?? '').toString().trim().toLowerCase();
          if (code) {
            if (!map[code]) map[code] = [];
            map[code].push({ 
              startTime: data.startTime, 
              endTime: data.endTime,
              fromDate: emp.fromDate,
              toDate: emp.toDate,
              id: doc.id 
            });
          }
        });
      });
      setShiftsMap(map);
    } catch (error) {
      console.error('Error fetching shifts:', error);
    }
  };

  const fetchDevices = async () => {
    if (!currentUser) return;
    try {
      const snapshot = await getDocs(collection(db, 'devices'));
      const map: Record<string, string> = {};
      snapshot.forEach((doc) => {
        const data = doc.data();
        const key = (data.deviceId ?? '').toString().trim();
        if (key) map[key] = data.location ?? '';
      });
      setDevicesMap(map);
    } catch (error) {
      console.error('Error fetching devices:', error);
    }
  };

  const getShiftForPunch = (userId: string | undefined, logDate: any): any | null => {
    if (!userId) return null;
    const key = userId.trim().toLowerCase();
    const shifts = shiftsMap[key];
    if (!shifts || shifts.length === 0) return null;
    const d = toDate(logDate);
    if (!d) return null;
    const punchDateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    return shifts.find((s) => punchDateStr >= s.fromDate && punchDateStr <= s.toDate) ?? null;
  };

  const formatDiff = (diffMin: number): string => {
    const abs = Math.abs(diffMin);
    if (abs === 0) return '';
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    if (h === 0) return ` · ${m}m`;
    if (m === 0) return ` · ${h}h`;
    return ` · ${h}h ${m}m`;
  };

  const getPunchStatus = (punch: RawPunch): { label: string; color: string } | null => {
    const shift = getShiftForPunch(punch.userId, punch.logDate);
    if (!shift) return null;
    const d = toDate(punch.logDate);
    if (!d) return null;
    const punchMin = d.getHours() * 60 + d.getMinutes();
    const [sh, sm] = (punch.direction === 'in' ? shift.startTime : shift.endTime).split(':').map(Number);
    const shiftMin = sh * 60 + sm;
    const diff = punchMin - shiftMin;
    if (punch.direction === 'in') {
      return diff <= 0
        ? { label: `Early${formatDiff(diff)}`, color: 'bg-blue-100 text-blue-700' }
        : { label: `Late${formatDiff(diff)}`, color: 'bg-orange-100 text-orange-700' };
    } else if (punch.direction === 'out') {
      if (diff < 0) return { label: `Early Out${formatDiff(diff)}`, color: 'bg-yellow-100 text-yellow-700' };
      if (diff === 0) return { label: 'On Time', color: 'bg-green-100 text-green-700' };
      return { label: `Late Out${formatDiff(diff)}`, color: 'bg-orange-100 text-orange-700' };
    }
    return null;
  };

  const resolveEmployeeName = (userId?: string): string => {
    if (!userId) return '';
    return employeeMap[userId.trim().toLowerCase()] ?? '';
  };

  const resolveDeviceLocation = (deviceId?: number): string => {
    if (!deviceId) return '—';
    return devicesMap[String(deviceId)] ?? String(deviceId);
  };

  const handleNextPage = () => {
    if (currentPageIndex < totalPages - 1) {
      setCurrentPageIndex(currentPageIndex + 1);
    } else if (hasMore) {
      fetchMorePunches();
    }
  };

  const handlePrevPage = () => {
    if (currentPageIndex > 0) {
      setCurrentPageIndex(currentPageIndex - 1);
    }
  };

  const filteredPunches = allPunches.filter((p: RawPunch) => {
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      const empName = resolveEmployeeName(p.userId).toLowerCase();
      return (
        p.userId?.toLowerCase().includes(q) ||
        empName.includes(q) ||
        p.deviceLogId?.toLowerCase().includes(q) ||
        p.direction?.toLowerCase().includes(q) ||
        p.sourceTable?.toLowerCase().includes(q) ||
        String(p.deviceId ?? '').includes(q)
      );
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredPunches.length / PAGE_SIZE));
  const paginatedPunches = filteredPunches.slice(currentPageIndex * PAGE_SIZE, (currentPageIndex + 1) * PAGE_SIZE);

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
            <h1 className="text-xl font-semibold text-secondary-900">Attendances</h1>
            <p className="text-sm text-secondary-500">Device attendance logs</p>
          </div>
        </div>
        <button
          onClick={() => { setLastDoc(null); setHasMore(false); setCurrentPageIndex(0); fetchPage(fromDate, toDateFilter, locationFilter); }}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-secondary-700 bg-white border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto bg-secondary-50 p-6">
        {/* Search */}
        <div className="mb-4 flex gap-3 flex-wrap items-end">
          <div className="relative max-w-md flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-secondary-600 mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-400" />
              <input
                type="text"
                placeholder="Search by user ID, device, direction..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="w-40">
            <label className="block text-xs font-medium text-secondary-600 mb-1">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
          <div className="w-40">
            <label className="block text-xs font-medium text-secondary-600 mb-1">To</label>
            <input
              type="date"
              value={toDateFilter}
              onChange={(e) => setToDateFilter(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
          <div className="w-48">
            <label className="block text-xs font-medium text-secondary-600 mb-1">Location</label>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="">All Locations</option>
              {Array.from(new Set(Object.values(devicesMap))).sort().map((loc) => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-secondary-300 border-t-green-600 rounded-full animate-spin" />
          </div>
        ) : filteredPunches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <Calendar className="w-10 h-10 text-green-600" />
            </div>
            <h3 className="text-lg font-medium text-secondary-900 mb-2">No records found</h3>
            <p className="text-sm text-secondary-500">Try adjusting your search or refresh the page.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-secondary-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary-50 border-b border-secondary-200">
                    <th className="text-left px-4 py-3 font-semibold text-secondary-700">User ID</th>
                    <th className="text-left px-4 py-3 font-semibold text-secondary-700">Employee Name</th>
                    <th className="text-left px-4 py-3 font-semibold text-secondary-700">Date</th>
                    <th className="text-left px-4 py-3 font-semibold text-secondary-700">Time</th>
                    <th className="text-left px-4 py-3 font-semibold text-secondary-700">Direction</th>
                    <th className="text-left px-4 py-3 font-semibold text-secondary-700">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-secondary-700">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedPunches.map((punch: RawPunch, idx: number) => (
                    <tr
                      key={punch.id}
                      className={`border-b border-secondary-100 hover:bg-secondary-50 transition-colors ${idx % 2 === 0 ? '' : 'bg-secondary-50/50'}`}
                    >
                      <td className="px-4 py-2.5 font-medium text-secondary-900">{punch.userId ?? '—'}</td>
                      <td className="px-4 py-2.5 text-secondary-800">{resolveEmployeeName(punch.userId) || <span className="text-secondary-400 text-xs">Unknown</span>}</td>
                      <td className="px-4 py-2.5 text-secondary-700 whitespace-nowrap">{formatDate(punch.logDate)}</td>
                      <td className="px-4 py-2.5 text-secondary-700 whitespace-nowrap">{formatTime(punch.logDate)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          punch.direction === 'in'
                            ? 'bg-green-100 text-green-700'
                            : punch.direction === 'out'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-secondary-100 text-secondary-600'
                        }`}>
                          {punch.direction ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {(() => {
                          const status = getPunchStatus(punch);
                          if (!status) return <span className="text-secondary-300 text-xs">—</span>;
                          return (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                              {status.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-2.5 text-secondary-700">{resolveDeviceLocation(punch.deviceId)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pagination */}
        {!loading && (
          <div className="mt-4 flex items-center justify-between text-sm text-secondary-500">
            <span>
              <>
                Page {currentPageIndex + 1} of {totalPages}{hasMore ? '+' : ''} &nbsp;·&nbsp; {filteredPunches.length} total match{filteredPunches.length !== 1 ? 'es' : ''}{hasMore ? '+' : ''}
              </>
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevPage}
                disabled={currentPageIndex === 0}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-secondary-200 bg-white hover:bg-secondary-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} /> Prev
              </button>
              <button
                onClick={handleNextPage}
                disabled={currentPageIndex >= totalPages - 1 && !hasMore || loadingMore}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-secondary-200 bg-white hover:bg-secondary-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loadingMore ? <div className="w-4 h-4 border-2 border-secondary-300 border-t-green-600 rounded-full animate-spin" /> : <ChevronRight size={16} />}
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
