import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getDailyReportData, DailyReportData } from '@/utils/attendanceExport';

export const DailyReportPreviewPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const fromDate = searchParams.get('from') ?? '';
  const toDate = searchParams.get('to') ?? '';
  const location = searchParams.get('location') ?? '';

  const [data, setData] = useState<DailyReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const reportData = await getDailyReportData(fromDate, toDate, location);
        setData(reportData);
      } catch (err) {
        setError('Failed to load preview.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [fromDate, toDate, location]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-gray-600">Loading preview...</p>
      </div>
    );
  }

  if (error || !data || data.rows.length === 0) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-gray-600">{error ?? 'No data available for preview.'}</p>
      </div>
    );
  }

  const headerStyle = {
    backgroundColor: '#E7F3FF',
    color: '#333333',
    fontWeight: 'bold' as const,
    fontSize: '15px',
    textAlign: 'center' as const,
    verticalAlign: 'middle' as const,
    padding: '12px',
    border: '1px solid #CCCCCC',
    whiteSpace: 'nowrap' as const,
  };

  const cellStyle = {
    color: '#333333',
    fontSize: '14px',
    textAlign: 'center' as const,
    verticalAlign: 'middle' as const,
    padding: '10px',
    border: '1px solid #CCCCCC',
    whiteSpace: 'nowrap' as const,
  };

  const titleStyle = {
    backgroundColor: '#F0F4F8',
    color: '#333333',
    fontWeight: 'bold' as const,
    fontSize: '20px',
    textAlign: 'center' as const,
    padding: '12px',
    border: '1px solid #CCCCCC',
    whiteSpace: 'nowrap' as const,
  };

  return (
    <div className="min-h-screen bg-white p-1">
      <style>{`
        @media print {
          .preview-container {
            padding: 0;
          }
        }
        .preview-scroll {
          overflow-x: auto;
          width: 100%;
          scrollbar-width: thin;
          scrollbar-color: #888 #f1f1f1;
        }
        .preview-scroll::-webkit-scrollbar {
          height: 10px;
        }
        .preview-scroll::-webkit-scrollbar-track {
          background: #f1f1f1;
        }
        .preview-scroll::-webkit-scrollbar-thumb {
          background: #888;
          border-radius: 5px;
        }
        .preview-scroll::-webkit-scrollbar-thumb:hover {
          background: #555;
        }
        .preview-table {
          border-collapse: collapse;
          min-width: max-content;
          width: 100%;
          table-layout: auto;
        }
        .preview-table th,
        .preview-table td {
          white-space: nowrap;
          min-width: 120px;
        }
      `}</style>
      <div className="preview-container w-full">
        <div className="preview-scroll">
          <table className="preview-table">
          <tbody>
            <tr>
              <td colSpan={data.headers.length} style={titleStyle}>
                DAILY ATTENDANCE REPORT
              </td>
            </tr>
            <tr>
              {data.headers.map((header, i) => (
                <td key={i} style={headerStyle}>
                  {header}
                </td>
              ))}
            </tr>
            {data.rows.map((record, rowIndex) => (
              <tr key={rowIndex}>
                <td style={cellStyle}>{record.userId}</td>
                <td style={{ ...cellStyle, textAlign: 'left' }}>{record.employeeName}</td>
                <td style={cellStyle}>{record.department}</td>
                <td style={cellStyle}>{record.location}</td>
                <td style={cellStyle}>{record.shift}</td>
                <td style={cellStyle}>{record.date}</td>
                <td style={cellStyle}>{record.inTime}</td>
                <td style={cellStyle}>{record.outTime}</td>
                <td style={cellStyle}>{record.workingDuration}</td>
                <td style={cellStyle}>{record.lateMinutes}</td>
                <td style={cellStyle}>{record.earlyMinutes}</td>
                <td style={cellStyle}>{record.overtimeMinutes}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
};
