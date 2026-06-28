import { useState, useEffect } from 'react';
import { ArrowLeft, Search, RefreshCw, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, orderBy, limit, startAfter, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
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
  return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
};

const formatTime = (logDate: any): string => {
  const d = toDate(logDate);
  if (!d) return '—';
  return d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const SEARCH_LIMIT = 1000;

export const RawPunchesPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuthContext();

  const [allPunches, setAllPunches] = useState<RawPunch[]>([]);
  const [loading, setLoading] = useState(true);
  const [employeeMap, setEmployeeMap] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [cursorStack, setCursorStack] = useState<(QueryDocumentSnapshot<DocumentData> | null)[]>([null]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [lastDocOnPage, setLastDocOnPage] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [shiftsMap, setShiftsMap] = useState<Record<string, any[]>>({});

  const fetchPage = async (afterDoc: QueryDocumentSnapshot<DocumentData> | null) => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const ref = collection(db, 'rawPunches');
      const constraints: any[] = [orderBy('logDate', 'desc'), limit(PAGE_SIZE + 1)];
      if (afterDoc) constraints.push(startAfter(afterDoc));
      const snapshot = await getDocs(query(ref, ...constraints));

      const docs = snapshot.docs;
      const hasMore = docs.length > PAGE_SIZE;
      const pageDocs = hasMore ? docs.slice(0, PAGE_SIZE) : docs;

      const data: RawPunch[] = pageDocs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setAllPunches(data);
      setHasNextPage(hasMore);
      setLastDocOnPage(pageDocs[pageDocs.length - 1] ?? null);
    } catch (error) {
      console.error('Error fetching rawPunches:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
    fetchShifts();
  }, [currentUser]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (debouncedSearch.trim()) {
      performSearch();
    } else {
      setIsSearchMode(false);
      setCursorStack([null]);
      setCurrentPageIndex(0);
      fetchPage(null);
    }
  }, [debouncedSearch]);

  const performSearch = async () => {
    if (!currentUser) return;
    setLoading(true);
    setIsSearchMode(true);
    try {
      const snapshot = await getDocs(query(collection(db, 'rawPunches'), orderBy('logDate', 'desc'), limit(SEARCH_LIMIT)));
      const data: RawPunch[] = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setAllPunches(data);
      setCurrentPageIndex(0);
      setHasNextPage(false);
    } catch (error) {
      console.error('Error searching rawPunches:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    if (!currentUser) return;
    try {
      const snapshot = await getDocs(collection(db, 'employees'));
      const map: Record<string, string> = {};
      snapshot.forEach((doc) => {
        const data = doc.data();
        const key = (data.employeeCodeInDevice ?? '').toString().trim().toLowerCase();
        if (key) map[key] = data.employeeName ?? '';
      });
      setEmployeeMap(map);
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
          if (!code) return;
          if (!map[code]) map[code] = [];
          map[code].push({
            startTime: data.startTime ?? '',
            endTime: data.endTime ?? '',
            fromDate: emp.fromDate ?? '',
            toDate: emp.toDate ?? '',
          });
        });
      });
      setShiftsMap(map);
    } catch (error) {
      console.error('Error fetching shifts:', error);
    }
  };

  const getShiftForPunch = (userId: string | undefined, logDate: any): any | null => {
    if (!userId) return null;
    const key = userId.trim().toLowerCase();
    const shifts = shiftsMap[key];
    if (!shifts || shifts.length === 0) return null;
    const d = toDate(logDate);
    if (!d) return null;
    const punchDateStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
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

  const handleNextPage = () => {
    if (!hasNextPage || !lastDocOnPage) return;
    const newStack = [...cursorStack, lastDocOnPage];
    setCursorStack(newStack);
    setCurrentPageIndex(currentPageIndex + 1);
    fetchPage(lastDocOnPage);
  };

  const handlePrevPage = () => {
    if (currentPageIndex === 0) return;
    const newIndex = currentPageIndex - 1;
    const prevCursor = cursorStack[newIndex] ?? null;
    const newStack = cursorStack.slice(0, newIndex + 1);
    setCursorStack(newStack);
    setCurrentPageIndex(newIndex);
    fetchPage(prevCursor);
  };

  const filteredPunches = allPunches.filter((p: RawPunch) => {
    if (!isSearchMode) return true;
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
  });

  const totalPages = Math.ceil(filteredPunches.length / PAGE_SIZE);
  const paginatedPunches = isSearchMode
    ? filteredPunches.slice(currentPageIndex * PAGE_SIZE, (currentPageIndex + 1) * PAGE_SIZE)
    : filteredPunches;

  const handleNextPageSearch = () => {
    if (currentPageIndex < totalPages - 1) {
      setCurrentPageIndex(currentPageIndex + 1);
    }
  };

  const handlePrevPageSearch = () => {
    if (currentPageIndex > 0) {
      setCurrentPageIndex(currentPageIndex - 1);
    }
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
            <h1 className="text-xl font-semibold text-secondary-900">Attendances</h1>
            <p className="text-sm text-secondary-500">Device attendance logs</p>
          </div>
        </div>
        <button
          onClick={() => { setCursorStack([null]); setCurrentPageIndex(0); fetchPage(null); }}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-secondary-700 bg-white border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto bg-secondary-50 p-6">
        {/* Search */}
        <div className="mb-4">
          <div className="relative max-w-md">
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
                    <th className="text-left px-4 py-3 font-semibold text-secondary-700">Device ID</th>
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
                      <td className="px-4 py-2.5 text-secondary-700">{punch.deviceId ?? '—'}</td>
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
              {isSearchMode ? (
                <>
                  Page {currentPageIndex + 1} of {totalPages} &nbsp;·&nbsp; {filteredPunches.length} total match{filteredPunches.length !== 1 ? 'es' : ''}
                </>
              ) : (
                <>
                  Page {currentPageIndex + 1} &nbsp;·&nbsp; {paginatedPunches.length} record{paginatedPunches.length !== 1 ? 's' : ''} shown
                </>
              )}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={isSearchMode ? handlePrevPageSearch : handlePrevPage}
                disabled={currentPageIndex === 0}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-secondary-200 bg-white hover:bg-secondary-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} /> Prev
              </button>
              <button
                onClick={isSearchMode ? handleNextPageSearch : handleNextPage}
                disabled={isSearchMode ? currentPageIndex >= totalPages - 1 : !hasNextPage}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-secondary-200 bg-white hover:bg-secondary-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
