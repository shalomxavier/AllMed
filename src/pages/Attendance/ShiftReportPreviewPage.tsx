import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getShiftReportData, ShiftReportData } from '@/utils/attendanceExport';

export const ShiftReportPreviewPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const fromDate = searchParams.get('from') ?? '';
  const toDate = searchParams.get('to') ?? '';

  const [data, setData] = useState<ShiftReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const reportData = await getShiftReportData(fromDate, toDate);
        setData(reportData);
      } catch (err) {
        setError('Failed to load preview.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [fromDate, toDate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-gray-600">Loading preview...</p>
      </div>
    );
  }

  if (error || !data || data.employees.length === 0) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-gray-600">{error ?? 'No data available for preview.'}</p>
      </div>
    );
  }

  const titleStyle = {
    backgroundColor: '#F0F4F8',
    color: '#333333',
    fontWeight: 'bold' as const,
    fontSize: '20px',
    textAlign: 'center' as const,
    verticalAlign: 'middle' as const,
    padding: '12px',
    border: '1px solid #CCCCCC',
    whiteSpace: 'nowrap' as const,
  };

  const rangeStyle = {
    backgroundColor: '#E8F0F8',
    color: '#333333',
    fontWeight: 'bold' as const,
    fontSize: '16px',
    textAlign: 'center' as const,
    verticalAlign: 'middle' as const,
    padding: '10px',
    border: '1px solid #CCCCCC',
    whiteSpace: 'nowrap' as const,
  };

  const fixedHeaderStyle = {
    backgroundColor: '#E7F3FF',
    color: '#333333',
    fontWeight: 'bold' as const,
    fontSize: '14px',
    textAlign: 'center' as const,
    verticalAlign: 'middle' as const,
    padding: '10px',
    border: '1px solid #CCCCCC',
    whiteSpace: 'nowrap' as const,
  };

  const dayNameStyle = {
    backgroundColor: '#F0F8FF',
    color: '#333333',
    fontWeight: 'bold' as const,
    fontSize: '14px',
    textAlign: 'center' as const,
    verticalAlign: 'middle' as const,
    padding: '10px',
    border: '1px solid #CCCCCC',
    whiteSpace: 'nowrap' as const,
  };

  const dateHeaderStyle = {
    backgroundColor: '#E8F0F8',
    color: '#333333',
    fontWeight: 'bold' as const,
    fontSize: '14px',
    textAlign: 'center' as const,
    verticalAlign: 'middle' as const,
    padding: '10px',
    border: '1px solid #CCCCCC',
    whiteSpace: 'nowrap' as const,
  };

  const fixedCellStyle = {
    color: '#333333',
    fontSize: '14px',
    textAlign: 'left' as const,
    verticalAlign: 'middle' as const,
    padding: '10px',
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
    minWidth: '90px',
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
        }
      `}</style>
      <div className="preview-container w-full">
        <div className="preview-scroll">
          <table className="preview-table">
            <thead>
              <tr>
                <td colSpan={4 + data.dateLabels.length} style={titleStyle}>
                  SHIFT ASSIGNMENT REPORT
                </td>
              </tr>
              <tr>
                <td colSpan={4 + data.dateLabels.length} style={rangeStyle}>
                  {fromDate.toUpperCase()} TO {toDate.toUpperCase()}
                </td>
              </tr>
              <tr>
                <th style={fixedHeaderStyle} rowSpan={2}>Emp Code</th>
                <th style={fixedHeaderStyle} rowSpan={2}>Name</th>
                <th style={fixedHeaderStyle} rowSpan={2}>Designation</th>
                <th style={fixedHeaderStyle} rowSpan={2}>Dept</th>
                {data.dayNames.map((day, i) => (
                  <th key={`day-${i}`} style={dayNameStyle}>
                    {day}
                  </th>
                ))}
              </tr>
              <tr>
                {data.dateLabels.map((label, i) => (
                  <th key={`date-${i}`} style={dateHeaderStyle}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.employees.map((emp, rowIndex) => (
                <tr key={rowIndex}>
                  <td style={{ ...fixedCellStyle, fontWeight: 'bold' }}>{emp.code}</td>
                  <td style={fixedCellStyle}>{emp.name}</td>
                  <td style={fixedCellStyle}>{emp.designation}</td>
                  <td style={fixedCellStyle}>{emp.department}</td>
                  {emp.values.map((value, i) => (
                    <td key={i} style={cellStyle}>{value}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
