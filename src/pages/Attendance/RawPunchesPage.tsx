import { useState, useEffect, useRef, useMemo } from 'react';
import { ArrowLeft, Search, RefreshCw, Calendar, ChevronLeft, ChevronRight, Download, Clock, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { collection, getDocs, query, orderBy, limit, startAfter, where, Timestamp, QueryDocumentSnapshot, DocumentData, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/firebase/firebase';
import { useAuthContext } from '@/contexts/AuthContext';
import { useToast } from '@/pages/DMS/components/Toast';

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

const formatTimeHHMM = (date: Date | null): string => {
  if (!date) return '—';
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const formatMinutes = (minutes: number): string => {
  if (!isFinite(minutes) || minutes <= 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

const formatLocalDate = (date: Date | null): string => {
  if (!date) return '';
  // Treat stored Firestore UTC timestamps as wall-clock dates.
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

interface DailyRecord {
  id: string;
  userId: string;
  employeeName: string;
  department: string;
  location: string;
  shift: any | null;
  date: Date | null;
  inTime: Date | null;
  outTime: Date | null;
  inTimes: Date[];
  outTimes: Date[];
  workingDurationMinutes: number;
  lateMinutes: number;
  earlyMinutes: number;
  overtimeMinutes: number;
}

interface AnalyzeResult {
  type: 'in' | 'out';
  userId: string;
  employeeName: string;
  location: string;
  date: Date | null;
  shiftTime: string;
  actualTime: Date;
  deviationMinutes: number;
  deviationLabel: string;
}

const SEARCH_LIMIT = 1000;
const ANALYSIS_THRESHOLD_MINUTES = 120;

export const RawPunchesPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, userData } = useAuthContext();
  const { showToast, ToastContainer } = useToast();

  const [allPunches, setAllPunches] = useState<RawPunch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [employeeMap, setEmployeeMap] = useState<Record<string, string>>({});
  const [departmentMap, setDepartmentMap] = useState<Record<string, string>>({});
  const [workLocationMap, setWorkLocationMap] = useState<Record<string, string>>({});
  const [employeeCodeOriginalMap, setEmployeeCodeOriginalMap] = useState<Record<string, string>>({});
  const [branchesList, setBranchesList] = useState<{ id: string; name: string; employeeIds: string[] }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [shiftsMap, setShiftsMap] = useState<Record<string, any[]>>({});
  const [employeesLoaded, setEmployeesLoaded] = useState(false);
  const [locationFilter, setLocationFilter] = useState('');
  const [managerBranch, setManagerBranch] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDateFilter, setToDateFilter] = useState('');
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFromDate, setExportFromDate] = useState('');
  const [exportToDate, setExportToDate] = useState('');
  const activeFilters = useRef({ fromDate: '', toDateFilter: '', locationFilter: '' });
  const [isAnalyzeModalOpen, setIsAnalyzeModalOpen] = useState(false);
  const [analyzeResults, setAnalyzeResults] = useState<AnalyzeResult[]>([]);
  const [analyzeFromDate, setAnalyzeFromDate] = useState('');
  const [analyzeToDate, setAnalyzeToDate] = useState('');
  const [analyzeLocationFilter, setAnalyzeLocationFilter] = useState('');
  const [analyzeSearchQuery, setAnalyzeSearchQuery] = useState('');
  const [isFixing, setIsFixing] = useState(false);
  const [expandedTimeCells, setExpandedTimeCells] = useState<Set<string>>(new Set());

  const toggleTimeCell = (recordId: string, type: 'in' | 'out') => {
    const key = `${recordId}-${type}`;
    setExpandedTimeCells((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderTimeCell = (record: DailyRecord, type: 'in' | 'out') => {
    const times = type === 'in' ? record.inTimes : record.outTimes;
    const key = `${record.id}-${type}`;
    const expanded = expandedTimeCells.has(key);
    if (times.length === 0) return <span>—</span>;
    if (times.length === 1) return <span>{formatTimeHHMM(times[0])}</span>;
    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1">
          <span>{formatTimeHHMM(times[0])}</span>
          <button
            onClick={() => toggleTimeCell(record.id, type)}
            className="text-secondary-500 hover:text-secondary-700 focus:outline-none"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? (
              <ChevronRight size={14} className="rotate-90" />
            ) : (
              <ChevronRight size={14} />
            )}
          </button>
        </div>
        {expanded && times.slice(1).map((t, i) => (
          <span key={i} className="text-secondary-500">{formatTimeHHMM(t)}</span>
        ))}
      </div>
    );
  };

  useEffect(() => {
    const today = new Date();
    const firstDayOfMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const formatDateLocal = (date: Date) => {
      // Use UTC components to match the wall-clock interpretation of stored timestamps.
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    const from = formatDateLocal(firstDayOfMonth);
    const to = formatDateLocal(today);
    setFromDate(from);
    setToDateFilter(to);
    setExportFromDate(from);
    setExportToDate(to);
  }, []);

  // Returns null when no branch filter is active (i.e. show everything).
  // Returns a (possibly empty) array of matching userIds when a branch IS selected,
  // so that a branch with zero matching employees correctly shows zero results
  // instead of silently falling back to "no filter".
  // Matches by employee.workLocation (same source of truth used by EmployeesPage,
  // ReportsPage, InsightsPage) rather than branches.employeeIds, which can go stale.
  const getUserIdsForBranch = (branchName: string): string[] | null => {
    if (!branchName) return null;
    return Object.entries(workLocationMap)
      .filter(([, loc]) => loc === branchName)
      .map(([key]) => employeeCodeOriginalMap[key] ?? key);
  };

  const buildQueryConstraints = (from: string, to: string, userIds: string[] | null, cursor?: QueryDocumentSnapshot<DocumentData>) => {
    const constraints: any[] = [orderBy('logDate', 'desc')];
    if (from) {
      // Treat the date string as UTC to match the wall-clock interpretation of stored timestamps.
      const fromTs = Timestamp.fromDate(new Date(from + 'T00:00:00Z'));
      constraints.push(where('logDate', '>=', fromTs));
    }
    if (to) {
      const toTs = Timestamp.fromDate(new Date(to + 'T23:59:59Z'));
      constraints.push(where('logDate', '<=', toTs));
    }
    if (userIds && userIds.length > 0) {
      constraints.push(where('userId', 'in', userIds.slice(0, 30)));
    }
    if (cursor) constraints.push(startAfter(cursor));
    constraints.push(limit(SEARCH_LIMIT));
    return constraints;
  };

  const fetchPage = async (from = fromDate, to = toDateFilter, loc = locationFilter) => {
    if (!currentUser) return;
    activeFilters.current = { fromDate: from, toDateFilter: to, locationFilter: loc };
    setLoading(true);
    try {
      const userIds = getUserIdsForBranch(loc);
      // Branch selected but no employees match it: show zero results instead of
      // silently skipping the filter (Firestore 'in' rejects empty arrays).
      if (userIds !== null && userIds.length === 0) {
        setAllPunches([]);
        setLastDoc(null);
        setHasMore(false);
        setCurrentPageIndex(0);
        return;
      }
      const constraints = buildQueryConstraints(from, to, userIds);
      const snapshot = await getDocs(query(collection(db, 'rawPunches'), ...constraints));
      console.log('[fetchPage] docs returned:', snapshot.docs.length, 'hasMore:', snapshot.docs.length === SEARCH_LIMIT);
      const data: RawPunch[] = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
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
      const userIds = getUserIdsForBranch(loc);
      if (userIds !== null && userIds.length === 0) {
        setHasMore(false);
        return;
      }
      const constraints = buildQueryConstraints(from, to, userIds, lastDoc);
      const snapshot = await getDocs(query(collection(db, 'rawPunches'), ...constraints));
      const data: RawPunch[] = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
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
    fetchBranches();
  }, [currentUser]);

  useEffect(() => {
    const resolveManagerBranch = async () => {
      if (userData?.designation === 'Branch Manager' && currentUser) {
        try {
          const branchQuery = query(collection(db, 'branches'), where('managerId', '==', currentUser.uid));
          const branchSnapshot = await getDocs(branchQuery);
          const branchName = branchSnapshot.empty ? '' : (branchSnapshot.docs[0].data().name || '');
          setManagerBranch(branchName);
          setLocationFilter(branchName);
        } catch (err) {
          console.error('Error resolving manager branch:', err);
          setManagerBranch('');
        }
      }
    };
    resolveManagerBranch();
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
      const deptMap: Record<string, string> = {};
      const workLocMap: Record<string, string> = {};
      const originalCaseMap: Record<string, string> = {};
      snapshot.forEach((doc) => {
        const data = doc.data();
        const rawCode = (data.employeeCodeInDevice ?? '').toString().trim();
        const key = rawCode.toLowerCase();
        if (key) {
          map[key] = data.employeeName ?? '';
          deptMap[key] = data.department ?? '';
          workLocMap[key] = data.workLocation ?? '';
          originalCaseMap[key] = rawCode;
        }
      });
      setEmployeeMap(map);
      setDepartmentMap(deptMap);
      setWorkLocationMap(workLocMap);
      setEmployeeCodeOriginalMap(originalCaseMap);
      setEmployeesLoaded(true);
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  };

  const fetchBranches = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'branches'));
      const list = snapshot.docs.map((b) => ({ id: b.id, name: b.data().name || '', employeeIds: b.data().employeeIds || [] }));
      setBranchesList(list);
    } catch (error) {
      console.error('Error fetching branches:', error);
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
              name: data.name ?? '',
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

  const getShiftForPunch = (userId: string | undefined, logDate: any): any | null => {
    if (!userId) return null;
    const key = userId.trim().toLowerCase();
    const shifts = shiftsMap[key];
    if (!shifts || shifts.length === 0) return null;
    const d = toDate(logDate);
    if (!d) return null;
    const punchDateStr = formatLocalDate(d);
    return shifts.find((s) => punchDateStr >= s.fromDate && punchDateStr <= s.toDate) ?? null;
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

  const handleExport = () => {
    setExportFromDate(fromDate);
    setExportToDate(toDateFilter);
    setIsExportModalOpen(true);
  };

  const openAnalyzeModal = () => {
    setAnalyzeFromDate(fromDate);
    setAnalyzeToDate(toDateFilter);
    setAnalyzeLocationFilter(locationFilter);
    setAnalyzeSearchQuery(searchQuery);
    runAnalysis(fromDate, toDateFilter);
    setIsAnalyzeModalOpen(true);
  };

  const runAnalysis = (from: string, to: string) => {
    const filteredByDate = dailyRecords.filter((record) => {
      if (!record.date) return false;
      const dateStr = formatLocalDate(record.date);
      if (from && dateStr < from) return false;
      if (to && dateStr > to) return false;
      return true;
    });

    const buildAnomaly = (
      type: 'in' | 'out',
      record: DailyRecord,
      actualTime: Date,
      shiftTime: string
    ): AnalyzeResult | null => {
      const [h, m] = shiftTime.split(':').map(Number);
      const shiftMin = h * 60 + m;
      const actualMin = actualTime.getUTCHours() * 60 + actualTime.getUTCMinutes();
      const diffMin = actualMin - shiftMin;
      if (Math.abs(diffMin) <= ANALYSIS_THRESHOLD_MINUTES) return null;
      return {
        type,
        userId: record.userId,
        employeeName: record.employeeName,
        location: record.location,
        date: record.date,
        shiftTime,
        actualTime,
        deviationMinutes: diffMin,
        deviationLabel:
          diffMin < 0
            ? `${Math.round(Math.abs(diffMin) / 60)}h early`
            : `${Math.round(Math.abs(diffMin) / 60)}h ${type === 'in' ? 'late' : 'overtime'}`,
      };
    };

    const anomalies = filteredByDate.flatMap((record) => {
      const items: AnalyzeResult[] = [];
      const shift = record.shift;
      if (!shift) return items;

      record.inTimes.forEach((inTime) => {
        const anomaly = shift.startTime ? buildAnomaly('in', record, inTime, shift.startTime) : null;
        if (anomaly) items.push(anomaly);
      });

      record.outTimes.forEach((outTime) => {
        const anomaly = shift.endTime ? buildAnomaly('out', record, outTime, shift.endTime) : null;
        if (anomaly) items.push(anomaly);
      });

      return items;
    });

    setAnalyzeResults(anomalies);
  };

  const filteredAnalyzeResults = useMemo(() => {
    const search = analyzeSearchQuery.trim().toLowerCase();
    return analyzeResults.filter((result) => {
      if (analyzeLocationFilter && result.location !== analyzeLocationFilter) return false;
      if (!search) return true;
      const date = result.date ? formatLocalDate(result.date) : '';
      return (
        result.userId.toLowerCase().includes(search) ||
        result.employeeName.toLowerCase().includes(search) ||
        result.location.toLowerCase().includes(search) ||
        result.type.includes(search) ||
        date.includes(search)
      );
    });
  }, [analyzeResults, analyzeLocationFilter, analyzeSearchQuery]);

  const findPunchToFixInArray = (result: AnalyzeResult, punches: RawPunch[]): RawPunch | null => {
    if (!result.date) return null;
    const targetDateStr = formatLocalDate(result.date);
    const targetUserId = result.userId.trim().toLowerCase();
    const targetTime = result.actualTime.getTime();

    return (
      punches.find((p) => {
        if (!p.userId || !p.logDate) return false;
        const d = toDate(p.logDate);
        if (!d) return false;
        const dateStr = formatLocalDate(d);
        return (
          p.userId.trim().toLowerCase() === targetUserId &&
          dateStr === targetDateStr &&
          d.getTime() === targetTime
        );
      }) ?? null
    );
  };

  const testDirectionSwapInArray = (punches: RawPunch[], result: AnalyzeResult): boolean => {
    const testDailyRecords = computeDailyRecords(punches);
    const testRecord = testDailyRecords.find((r) => {
      if (!r.date || !result.date) return false;
      const sameUser = r.userId.trim().toLowerCase() === result.userId.trim().toLowerCase();
      const sameDate = formatLocalDate(r.date) === formatLocalDate(result.date);
      return sameUser && sameDate;
    });

    if (!testRecord || !testRecord.shift || !testRecord.shift.startTime || !testRecord.shift.endTime) return false;

    const targetTime = result.actualTime.getTime();
    const [sh, sm] = testRecord.shift.startTime.split(':').map(Number);
    const shiftStartMin = sh * 60 + sm;
    const [eh, em] = testRecord.shift.endTime.split(':').map(Number);
    const shiftEndMin = eh * 60 + em;

    const isWithinThreshold = (time: Date, type: 'in' | 'out') => {
      const actualMin = time.getUTCHours() * 60 + time.getUTCMinutes();
      const shiftMin = type === 'in' ? shiftStartMin : shiftEndMin;
      const diffMin = actualMin - shiftMin;
      return Math.abs(diffMin) <= ANALYSIS_THRESHOLD_MINUTES;
    };

    if (result.type === 'in') {
      const swappedOut = testRecord.outTimes.find((t) => t.getTime() === targetTime);
      return swappedOut ? isWithinThreshold(swappedOut, 'out') : false;
    } else {
      const swappedIn = testRecord.inTimes.find((t) => t.getTime() === targetTime);
      return swappedIn ? isWithinThreshold(swappedIn, 'in') : false;
    }
  };

  const handleFixAnomalies = async () => {
    if (filteredAnalyzeResults.length === 0 || isFixing) return;
    const resultsToFix = [...filteredAnalyzeResults];
    setIsFixing(true);
    let fixedCount = 0;
    let workingPunches = [...allPunches];

    try {
      const plannedFixes: { id: string; newDirection: string }[] = [];

      for (const result of resultsToFix) {
        const punchToFix = findPunchToFixInArray(result, workingPunches);
        if (!punchToFix) continue;

        const newDirection = punchToFix.direction === 'in' ? 'out' : 'in';
        const testPunches = workingPunches.map((p) =>
          p.id === punchToFix.id ? { ...p, direction: newDirection } : p
        );
        const isResolved = testDirectionSwapInArray(testPunches, result);
        if (!isResolved) continue;

        plannedFixes.push({ id: punchToFix.id, newDirection });
        workingPunches = testPunches;
        fixedCount++;
      }

      for (const fix of plannedFixes) {
        await updateDoc(doc(db, 'rawPunches', fix.id), { direction: fix.newDirection });
      }

      if (plannedFixes.length > 0) {
        setAllPunches(workingPunches);
      }

      setIsAnalyzeModalOpen(false);
      showToast('success', `Fixed ${fixedCount} of ${resultsToFix.length} anomalies.`);
    } catch (error) {
      console.error('Error fixing anomalies:', error);
      showToast('error', 'Error fixing anomalies. Please try again.');
    } finally {
      setIsFixing(false);
    }

    runAnalysis(analyzeFromDate, analyzeToDate);
  };

  const fetchAllPunchesForExport = async (from: string, to: string, loc: string): Promise<RawPunch[]> => {
    if (!currentUser) return [];
    const all: RawPunch[] = [];
    let cursor: QueryDocumentSnapshot<DocumentData> | null = null;
    const userIds = getUserIdsForBranch(loc);
    if (userIds !== null && userIds.length === 0) return [];
    while (true) {
      const constraints = buildQueryConstraints(from, to, userIds, cursor || undefined);
      const snapshot = await getDocs(query(collection(db, 'rawPunches'), ...constraints));
      const data: RawPunch[] = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      all.push(...data);
      if (snapshot.docs.length < SEARCH_LIMIT) break;
      cursor = snapshot.docs[snapshot.docs.length - 1];
    }
    return all;
  };

  const exportRecordsToExcel = (records: DailyRecord[], from: string, to: string) => {
    const headers = [
      'Employee ID',
      'Employee Name',
      'Department',
      'Branch',
      'Shift',
      'Date',
      'In Time',
      'Out Time',
      'Working Duration',
      'Late Minutes',
      'Early Minutes',
      'Overtime Minutes',
    ];
    const rows = records.map((record) => [
      record.userId,
      record.employeeName,
      record.department,
      record.location,
      record.shift ? record.shift.name || `${record.shift.startTime} - ${record.shift.endTime}` : '',
      record.date ? formatLocalDate(record.date) : '',
      record.inTimes.length > 0 ? record.inTimes.map(formatTimeHHMM).join(', ') : '',
      record.outTimes.length > 0 ? record.outTimes.map(formatTimeHHMM).join(', ') : '',
      record.workingDurationMinutes > 0 ? formatMinutes(record.workingDurationMinutes) : '',
      record.lateMinutes > 0 ? formatMinutes(record.lateMinutes) : '',
      record.earlyMinutes > 0 ? formatMinutes(record.earlyMinutes) : '',
      record.overtimeMinutes > 0 ? formatMinutes(record.overtimeMinutes) : '',
    ]);
    const data = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = headers.map((header, idx) => {
      const maxLen = Math.max(header.length, ...rows.map((row) => String(row[idx] ?? '').length));
      return { wch: Math.min(Math.max(maxLen + 2, 10), 40) };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    const fromLabel = from || 'all';
    const toLabel = to || 'all';
    XLSX.writeFile(wb, `attendance-${fromLabel}-to-${toLabel}.xlsx`);
  };

  const computeDailyRecords = (punches: RawPunch[]): DailyRecord[] => {
    const groups: Record<string, RawPunch[]> = {};
    punches.forEach((punch) => {
      const d = toDate(punch.logDate);
      if (!d || !punch.userId) return;
      const dateKey = `${punch.userId.trim().toLowerCase()}_${formatLocalDate(d)}`;
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(punch);
    });

    return Object.values(groups).map((punches) => {
      const sorted = [...punches].sort((a, b) => {
        const dA = toDate(a.logDate);
        const dB = toDate(b.logDate);
        if (!dA || !dB) return 0;
        return dA.getTime() - dB.getTime();
      });

      const firstPunch = sorted[0];
      const userId = firstPunch.userId ?? '';
      const key = userId.trim().toLowerCase();
      const firstIn = sorted.find((p) => p.direction === 'in');
      const lastOut = [...sorted].reverse().find((p) => p.direction === 'out');
      const inDate = toDate(firstIn?.logDate ?? null);
      const outDate = toDate(lastOut?.logDate ?? null);
      const date = toDate(firstPunch.logDate);
      const inTimes = sorted
        .filter((p) => p.direction === 'in')
        .map((p) => toDate(p.logDate))
        .filter((d): d is Date => d !== null);
      const outTimes = sorted
        .filter((p) => p.direction === 'out')
        .map((p) => toDate(p.logDate))
        .filter((d): d is Date => d !== null);

      const shift = date ? getShiftForPunch(userId, firstPunch.logDate) : null;
      let lateMinutes = 0;
      let earlyMinutes = 0;
      let overtimeMinutes = 0;

      if (inDate && shift?.startTime) {
        const [sh, sm] = shift.startTime.split(':').map(Number);
        const shiftStartMin = sh * 60 + sm;
        const inMin = inDate.getUTCHours() * 60 + inDate.getUTCMinutes();
        if (!isNaN(shiftStartMin) && inMin > shiftStartMin) {
          lateMinutes = inMin - shiftStartMin;
        }
      }

      if (outDate && shift?.endTime) {
        const [eh, em] = shift.endTime.split(':').map(Number);
        const shiftEndMin = eh * 60 + em;
        const outMin = outDate.getUTCHours() * 60 + outDate.getUTCMinutes();
        if (!isNaN(shiftEndMin)) {
          if (outMin < shiftEndMin) {
            earlyMinutes = shiftEndMin - outMin;
          } else if (outMin > shiftEndMin) {
            overtimeMinutes = outMin - shiftEndMin;
          }
        }
      }

      let workingDurationMinutes = 0;
      if (inDate && outDate && outDate.getTime() > inDate.getTime()) {
        workingDurationMinutes = Math.round((outDate.getTime() - inDate.getTime()) / (1000 * 60));
      } else if (inDate && outDate) {
        const inMin = inDate.getUTCHours() * 60 + inDate.getUTCMinutes();
        const outMin = outDate.getUTCHours() * 60 + outDate.getUTCMinutes();
        if (outMin >= inMin) {
          workingDurationMinutes = outMin - inMin;
        } else {
          workingDurationMinutes = outMin + 24 * 60 - inMin;
        }
        console.warn('[RawPunches] lastOut before firstIn UTC; used wall-clock time for duration', {
          userId,
          firstIn: inDate.toISOString(),
          lastOut: outDate.toISOString(),
          workingDurationMinutes,
        });
      }

      return {
        id: `${key}_${date ? formatLocalDate(date) : firstPunch.id}`,
        userId,
        employeeName: employeeMap[key] ?? '',
        department: departmentMap[key] ?? '—',
        location: workLocationMap[key] || '—',
        shift,
        date,
        inTime: inDate,
        outTime: outDate,
        inTimes,
        outTimes,
        workingDurationMinutes,
        lateMinutes,
        earlyMinutes,
        overtimeMinutes,
      };
    });
  };

  const handleExportConfirm = async () => {
    setIsExportModalOpen(false);
    setLoading(true);
    try {
      const punches = await fetchAllPunchesForExport(exportFromDate, exportToDate, locationFilter);
      const records = computeDailyRecords(punches).filter((record) => {
        if (debouncedSearch.trim()) {
          const q = debouncedSearch.toLowerCase();
          return (
            record.userId.toLowerCase().includes(q) ||
            record.employeeName.toLowerCase().includes(q) ||
            record.department.toLowerCase().includes(q) ||
            record.location.toLowerCase().includes(q)
          );
        }
        return true;
      });
      exportRecordsToExcel(records, exportFromDate, exportToDate);
    } catch (error) {
      console.error('Error exporting records:', error);
    } finally {
      setLoading(false);
    }
  };

  const dailyRecords: DailyRecord[] = useMemo(() => computeDailyRecords(allPunches), [allPunches, employeeMap, departmentMap, workLocationMap, shiftsMap]);

  const filteredRecords = dailyRecords.filter((record) => {
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      return (
        record.userId.toLowerCase().includes(q) ||
        record.employeeName.toLowerCase().includes(q) ||
        record.department.toLowerCase().includes(q) ||
        record.location.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
  const paginatedRecords = filteredRecords.slice(currentPageIndex * PAGE_SIZE, (currentPageIndex + 1) * PAGE_SIZE);

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col">
      <ToastContainer />
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
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-pink-600 rounded-lg hover:bg-pink-700 transition-colors"
          >
            <Download size={16} />
            Export
          </button>
          {userData?.designation !== 'Branch Manager' && (
            <button
              onClick={openAnalyzeModal}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
            >
              <Clock size={16} />
              Analyze
            </button>
          )}
          <button
            onClick={() => { setLastDoc(null); setHasMore(false); setCurrentPageIndex(0); fetchPage(fromDate, toDateFilter, locationFilter); }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-secondary-700 bg-white border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
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
            <label className="block text-xs font-medium text-secondary-600 mb-1">Branch</label>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              disabled={userData?.designation === 'Branch Manager'}
              className="w-full px-3 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-secondary-100 disabled:cursor-not-allowed"
            >
              {userData?.designation === 'Branch Manager' ? (
                <option value={managerBranch ?? ''}>{managerBranch || 'No branch assigned'}</option>
              ) : (
                <>
                  <option value="">All Branches</option>
                  {branchesList.map((b) => (
                    <option key={b.id} value={b.name}>{b.name}</option>
                  ))}
                </>
              )}
            </select>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-secondary-300 border-t-green-600 rounded-full animate-spin" />
          </div>
        ) : filteredRecords.length === 0 ? (
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
                    <th className="text-left px-4 py-3 font-semibold text-secondary-700 whitespace-nowrap">Employee ID</th>
                    <th className="text-left px-4 py-3 font-semibold text-secondary-700 whitespace-nowrap">Employee Name</th>
                    <th className="text-left px-4 py-3 font-semibold text-secondary-700 whitespace-nowrap">Department</th>
                    <th className="text-left px-4 py-3 font-semibold text-secondary-700 whitespace-nowrap">Branch</th>
                    <th className="text-left px-4 py-3 font-semibold text-secondary-700 whitespace-nowrap">Date</th>
                    <th className="text-left px-4 py-3 font-semibold text-secondary-700 whitespace-nowrap">Shift</th>
                    <th className="text-left px-4 py-3 font-semibold text-secondary-700 whitespace-nowrap">In Time</th>
                    <th className="text-left px-4 py-3 font-semibold text-secondary-700 whitespace-nowrap">Out Time</th>
                    <th className="text-left px-4 py-3 font-semibold text-secondary-700 whitespace-nowrap">Working Duration</th>
                    <th className="text-left px-4 py-3 font-semibold text-secondary-700 whitespace-nowrap">Late Minutes</th>
                    <th className="text-left px-4 py-3 font-semibold text-secondary-700 whitespace-nowrap">Early Minutes</th>
                    <th className="text-left px-4 py-3 font-semibold text-secondary-700 whitespace-nowrap">Overtime Minutes</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRecords.map((record: DailyRecord, idx: number) => (
                    <tr
                      key={record.id}
                      className={`border-b border-secondary-100 hover:bg-secondary-50 transition-colors ${idx % 2 === 0 ? '' : 'bg-secondary-50/50'}`}
                    >
                      <td className="px-4 py-2.5 font-medium text-secondary-900 whitespace-nowrap">{record.userId || '—'}</td>
                      <td className="px-4 py-2.5 text-secondary-800 whitespace-nowrap">{record.employeeName || <span className="text-secondary-400 text-xs">Unknown</span>}</td>
                      <td className="px-4 py-2.5 text-secondary-700 whitespace-nowrap">{record.department}</td>
                      <td className="px-4 py-2.5 text-secondary-700 whitespace-nowrap">{record.location}</td>
                      <td className="px-4 py-2.5 text-secondary-700 whitespace-nowrap">{record.date ? formatLocalDate(record.date) : '—'}</td>
                      <td className="px-4 py-2.5 text-secondary-700 whitespace-nowrap">
                        {record.shift
                          ? record.shift.name || `${record.shift.startTime} - ${record.shift.endTime}`
                          : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-secondary-700 whitespace-nowrap">
                        {renderTimeCell(record, 'in')}
                      </td>
                      <td className="px-4 py-2.5 text-secondary-700 whitespace-nowrap">
                        {renderTimeCell(record, 'out')}
                      </td>
                      <td className="px-4 py-2.5 text-secondary-700 whitespace-nowrap">{formatMinutes(record.workingDurationMinutes)}</td>
                      <td className="px-4 py-2.5 text-secondary-700 whitespace-nowrap">{formatMinutes(record.lateMinutes)}</td>
                      <td className="px-4 py-2.5 text-secondary-700 whitespace-nowrap">{formatMinutes(record.earlyMinutes)}</td>
                      <td className="px-4 py-2.5 text-secondary-700 whitespace-nowrap">{formatMinutes(record.overtimeMinutes)}</td>
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
                Page {currentPageIndex + 1} of {totalPages}{hasMore ? '+' : ''} &nbsp;·&nbsp; {filteredRecords.length} total match{filteredRecords.length !== 1 ? 'es' : ''}{hasMore ? '+' : ''}
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

      {/* Export Modal */}
      {isExportModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setIsExportModalOpen(false)}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-secondary-900 mb-4">Export Attendance</h2>
            <p className="text-sm text-secondary-500 mb-4">Select the period to export.</p>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-xs font-medium text-secondary-600 mb-1">From</label>
                <input
                  type="date"
                  value={exportFromDate}
                  onChange={(e) => setExportFromDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary-600 mb-1">To</label>
                <input
                  type="date"
                  value={exportToDate}
                  onChange={(e) => setExportToDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setIsExportModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-secondary-700 bg-white border border-secondary-300 rounded-lg hover:bg-secondary-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExportConfirm}
                disabled={!exportFromDate || !exportToDate}
                className="px-4 py-2 text-sm font-medium text-white bg-pink-600 rounded-lg hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Export
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Analyze Modal */}
      {isAnalyzeModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setIsAnalyzeModalOpen(false)}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl mx-4 p-6 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-secondary-900">Shift Time Analysis</h2>
                <p className="text-sm text-secondary-500">Ins/Outs more than 2 hours before or after assigned shift time</p>
              </div>
              <button
                onClick={() => setIsAnalyzeModalOpen(false)}
                className="p-1.5 rounded-lg text-secondary-500 hover:text-secondary-900 hover:bg-secondary-100 transition-colors"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4 mb-4 items-end">
              <div>
                <label className="block text-xs font-medium text-secondary-600 mb-1">From</label>
                <input
                  type="date"
                  value={analyzeFromDate}
                  onChange={(e) => {
                    const value = e.target.value;
                    setAnalyzeFromDate(value);
                    runAnalysis(value, analyzeToDate);
                  }}
                  className="w-full px-3 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary-600 mb-1">To</label>
                <input
                  type="date"
                  value={analyzeToDate}
                  onChange={(e) => {
                    const value = e.target.value;
                    setAnalyzeToDate(value);
                    runAnalysis(analyzeFromDate, value);
                  }}
                  className="w-full px-3 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-secondary-600 mb-1">Branch</label>
                <select
                  value={analyzeLocationFilter}
                  onChange={(e) => setAnalyzeLocationFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="">All Branches</option>
                  {branchesList.map((b) => (
                    <option key={b.id} value={b.name}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="xl:col-span-2">
                <label className="block text-xs font-medium text-secondary-600 mb-1">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-400" />
                  <input
                    type="text"
                    value={analyzeSearchQuery}
                    onChange={(e) => setAnalyzeSearchQuery(e.target.value)}
                    placeholder="Employee ID, name, date or type"
                    className="w-full pl-10 pr-3 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              </div>
              <button
                onClick={handleFixAnomalies}
                disabled={isFixing || filteredAnalyzeResults.length === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isFixing ? 'Fixing...' : 'Fix'}
              </button>
            </div>
            {filteredAnalyzeResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-3">
                  <Clock className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-lg font-medium text-secondary-900 mb-1">{analyzeResults.length === 0 ? 'No anomalies found' : 'No matching anomalies found'}</h3>
                <p className="text-sm text-secondary-500">{analyzeResults.length === 0 ? 'All ins and outs are within 2 hours of shift times for the selected period.' : 'Try adjusting the location or search filter.'}</p>
              </div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary-50 sticky top-0">
                    <tr className="border-b border-secondary-200">
                      <th className="text-left px-4 py-3 font-semibold text-secondary-700">Employee ID</th>
                      <th className="text-left px-4 py-3 font-semibold text-secondary-700">Employee Name</th>
                      <th className="text-left px-4 py-3 font-semibold text-secondary-700">Branch</th>
                      <th className="text-left px-4 py-3 font-semibold text-secondary-700">Date</th>
                      <th className="text-left px-4 py-3 font-semibold text-secondary-700">Type</th>
                      <th className="text-left px-4 py-3 font-semibold text-secondary-700">Shift Time</th>
                      <th className="text-left px-4 py-3 font-semibold text-secondary-700">Actual Time</th>
                      <th className="text-left px-4 py-3 font-semibold text-secondary-700">Deviation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAnalyzeResults.map((result, idx) => (
                      <tr key={`${result.userId}-${formatLocalDate(result.date)}-${result.type}-${idx}`} className="border-b border-secondary-100 hover:bg-secondary-50 transition-colors">
                        <td className="px-4 py-2.5 font-medium text-secondary-900 whitespace-nowrap">{result.userId}</td>
                        <td className="px-4 py-2.5 text-secondary-800 whitespace-nowrap">{result.employeeName || <span className="text-secondary-400 text-xs">Unknown</span>}</td>
                        <td className="px-4 py-2.5 text-secondary-700 whitespace-nowrap">{result.location}</td>
                        <td className="px-4 py-2.5 text-secondary-700 whitespace-nowrap">{result.date ? formatLocalDate(result.date) : '—'}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${result.type === 'in' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                            {result.type === 'in' ? 'In' : 'Out'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-secondary-700 whitespace-nowrap">{result.shiftTime}</td>
                        <td className="px-4 py-2.5 text-secondary-700 whitespace-nowrap">{formatTimeHHMM(result.actualTime)}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className={`text-xs font-medium ${result.deviationMinutes < 0 ? 'text-red-600' : 'text-amber-600'}`}>
                            {result.deviationLabel}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
