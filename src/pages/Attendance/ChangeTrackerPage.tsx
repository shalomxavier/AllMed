import { useState, useEffect } from 'react';
import { ArrowLeft, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, orderBy, limit, startAfter, where, Timestamp, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { db } from '@/firebase/firebase';
import { useAuthContext } from '@/contexts/AuthContext';
import { RedSpinner } from '@/components/common';

interface AuditRecord {
  id: string;
  punchId: string;
  action: 'edit' | 'delete' | 'add';
  userId: string;
  employeeName?: string;
  previousLogDate?: any;
  newLogDate?: any;
  deletedLogDate?: any;
  direction: string;
  previousDirection?: string;
  newDirection?: string;
  editedBy: string;
  editedByName: string;
  editedAt?: any;
}

const PAGE_SIZE = 50;

const toDate = (val: any): Date | null => {
  if (!val) return null;
  if (val?.toDate) return val.toDate();
  if (val instanceof Date) return val;
  return null;
};

const formatDateTime = (val: any): string => {
  const d = toDate(val);
  if (!d) return '—';
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatTimeHHMM = (val: any): string => {
  const d = toDate(val);
  if (!d) return '—';
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const formatDateOnly = (val: any): string => {
  const d = toDate(val);
  if (!d) return '—';
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const ChangeTrackerPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuthContext();

  const [records, setRecords] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [fromDate, setFromDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [toDateFilter, setToDateFilter] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (currentUser) fetchRecords();
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      setLastDoc(null);
      setHasMore(false);
      fetchRecords();
    }
  }, [fromDate, toDateFilter]);

  useEffect(() => {
    setCurrentPageIndex(0);
  }, [debouncedSearch]);

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const constraints: any[] = [orderBy('editedAt', 'desc'), limit(500)];

      if (fromDate) {
        const fromTs = Timestamp.fromDate(new Date(fromDate + 'T00:00:00Z'));
        constraints.push(where('editedAt', '>=', fromTs));
      }
      if (toDateFilter) {
        const toTs = Timestamp.fromDate(new Date(toDateFilter + 'T23:59:59Z'));
        constraints.push(where('editedAt', '<=', toTs));
      }

      const snapshot = await getDocs(query(collection(db, 'punchAuditLog'), ...constraints));
      const data: AuditRecord[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      } as AuditRecord));
      setRecords(data);
      setLastDoc(snapshot.docs[snapshot.docs.length - 1] ?? null);
      setHasMore(snapshot.docs.length === 500);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMore = async () => {
    if (!lastDoc || loadingMore) return;
    setLoadingMore(true);
    try {
      const constraints: any[] = [orderBy('editedAt', 'desc'), limit(500), startAfter(lastDoc)];
      if (fromDate) {
        const fromTs = Timestamp.fromDate(new Date(fromDate + 'T00:00:00Z'));
        constraints.push(where('editedAt', '>=', fromTs));
      }
      if (toDateFilter) {
        const toTs = Timestamp.fromDate(new Date(toDateFilter + 'T23:59:59Z'));
        constraints.push(where('editedAt', '<=', toTs));
      }
      const snapshot = await getDocs(query(collection(db, 'punchAuditLog'), ...constraints));
      const data: AuditRecord[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      } as AuditRecord));
      setRecords((prev) => [...prev, ...data]);
      setLastDoc(snapshot.docs[snapshot.docs.length - 1] ?? null);
      setHasMore(snapshot.docs.length === 500);
    } catch (error) {
      console.error('Error fetching more audit logs:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  const filteredRecords = records.filter((record) => {
    if (!debouncedSearch.trim()) return true;
    const q = debouncedSearch.toLowerCase();
    return (
      (record.userId ?? '').toLowerCase().includes(q) ||
      (record.employeeName ?? '').toLowerCase().includes(q) ||
      (record.editedByName ?? '').toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
  const paginatedRecords = filteredRecords.slice(currentPageIndex * PAGE_SIZE, (currentPageIndex + 1) * PAGE_SIZE);

  const handleNextPage = () => {
    if (currentPageIndex < totalPages - 1) {
      setCurrentPageIndex(currentPageIndex + 1);
    } else if (hasMore) {
      fetchMore();
    }
  };

  const handlePrevPage = () => {
    if (currentPageIndex > 0) {
      setCurrentPageIndex(currentPageIndex - 1);
    }
  };

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/attendance/records')}
            className="p-1.5 rounded-lg text-secondary-500 hover:text-secondary-900 hover:bg-secondary-100 transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-secondary-900">Alterations</h1>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 pb-4 flex flex-wrap items-end gap-4">
        <div className="w-1/2 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by employee or editor..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-secondary-600 mb-1">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="px-3 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-secondary-600 mb-1">To</label>
          <input
            type="date"
            value={toDateFilter}
            onChange={(e) => setToDateFilter(e.target.value)}
            className="px-3 py-2 bg-white border border-secondary-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RedSpinner />
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm font-medium text-secondary-700">No changes recorded</p>
            <p className="text-xs text-secondary-500 mt-1">Punch edits and deletes will appear here.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-secondary-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary-50 border-b border-secondary-200">
                    <th className="text-left px-4 py-3 font-semibold text-secondary-700 whitespace-nowrap">Changed At</th>
                    <th className="text-left px-4 py-3 font-semibold text-secondary-700 whitespace-nowrap">Action</th>
                    <th className="text-left px-4 py-3 font-semibold text-secondary-700 whitespace-nowrap">Employee ID</th>
                    <th className="text-left px-4 py-3 font-semibold text-secondary-700 whitespace-nowrap">Employee Name</th>
                    <th className="text-left px-4 py-3 font-semibold text-secondary-700 whitespace-nowrap">Direction</th>
                    <th className="text-left px-4 py-3 font-semibold text-secondary-700 whitespace-nowrap">Punch Date</th>
                    <th className="text-left px-4 py-3 font-semibold text-secondary-700 whitespace-nowrap">Original Time</th>
                    <th className="text-left px-4 py-3 font-semibold text-secondary-700 whitespace-nowrap">New Time</th>
                    <th className="text-left px-4 py-3 font-semibold text-secondary-700 whitespace-nowrap">Changed By</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRecords.map((record, idx) => {
                    const isEdit = record.action === 'edit';
                    const isAdd = record.action === 'add';
                    const isDelete = record.action === 'delete';
                    const originalTime = isEdit ? record.previousLogDate : (isDelete ? record.deletedLogDate : null);
                    const punchDate = isEdit ? record.previousLogDate : (isDelete ? record.deletedLogDate : record.newLogDate);
                    const previousDirection = record.previousDirection ?? record.direction;
                    const newDirection = record.newDirection ?? record.direction;
                    const directionChanged = isEdit && !!record.previousDirection && !!record.newDirection && previousDirection !== newDirection;
                    const actionBadge = isEdit
                      ? { label: 'Edit', className: 'bg-blue-100 text-blue-700' }
                      : isAdd
                      ? { label: 'Add', className: 'bg-green-100 text-green-700' }
                      : { label: 'Delete', className: 'bg-red-100 text-red-700' };

                    return (
                      <tr
                        key={record.id}
                        className={`border-b border-secondary-100 hover:bg-secondary-50 transition-colors ${idx % 2 === 0 ? '' : 'bg-secondary-50/50'}`}
                      >
                        <td className="px-4 py-2.5 text-secondary-700 whitespace-nowrap">{formatDateTime(record.editedAt)}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${actionBadge.className}`}>
                            {actionBadge.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-medium text-secondary-900 whitespace-nowrap">{record.userId || '—'}</td>
                        <td className="px-4 py-2.5 text-secondary-800 whitespace-nowrap">{record.employeeName || '—'}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {directionChanged ? (
                            <span className="inline-flex items-center gap-1">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${previousDirection === 'in' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                {(previousDirection ?? '').toUpperCase()}
                              </span>
                              <span className="text-secondary-400 text-xs">→</span>
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${newDirection === 'in' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                {(newDirection ?? '').toUpperCase()}
                              </span>
                            </span>
                          ) : (
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${(record.direction ?? '') === 'in' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                              {(record.direction ?? '').toUpperCase()}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-secondary-700 whitespace-nowrap">{formatDateOnly(punchDate)}</td>
                        <td className="px-4 py-2.5 text-secondary-700 whitespace-nowrap">{formatTimeHHMM(originalTime)}</td>
                        <td className="px-4 py-2.5 text-secondary-700 whitespace-nowrap">
                          {isDelete ? <span className="text-secondary-400">—</span> : formatTimeHHMM(record.newLogDate)}
                        </td>
                        <td className="px-4 py-2.5 text-secondary-700 whitespace-nowrap">{record.editedByName || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && filteredRecords.length > 0 && (
        <div className="px-6 py-4 flex items-center justify-between text-sm text-secondary-500">
          <span>
            Page {currentPageIndex + 1} of {totalPages}{hasMore ? '+' : ''} &middot; {filteredRecords.length} record{filteredRecords.length !== 1 ? 's' : ''}{hasMore ? '+' : ''}
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
              {loadingMore ? <RedSpinner size="sm" /> : <ChevronRight size={16} />}
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
