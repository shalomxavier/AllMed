import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getMonthlyReportData, MonthlyReportData, MonthlyEmployeeReport } from '@/utils/attendanceExport';
import { RedSpinner } from '@/components/common';

export const MonthlyReportPreviewPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const fromDate = searchParams.get('from') ?? '';
  const toDate = searchParams.get('to') ?? '';
  const location = searchParams.get('location') ?? '';

  const [data, setData] = useState<MonthlyReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const reportData = await getMonthlyReportData(fromDate, toDate, location);
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
        <RedSpinner />
      </div>
    );
  }

  if (error || !data || data.employeeReports.length === 0) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-gray-600">{error ?? 'No data available for preview.'}</p>
      </div>
    );
  }

  const totalColumn = 2 + data.dateLabels.length;

  const headerStyle = {
    backgroundColor: '#E7F3FF',
    color: '#333333',
    fontWeight: 'bold' as const,
    fontSize: '16px',
    textAlign: 'center' as const,
    verticalAlign: 'middle' as const,
    padding: '8px',
    border: '1px solid #CCCCCC',
    whiteSpace: 'nowrap' as const,
  };

  const titleStyle = {
    backgroundColor: '#F0F4F8',
    color: '#333333',
    fontWeight: 'bold' as const,
    fontSize: '18px',
    textAlign: 'center' as const,
    verticalAlign: 'middle' as const,
    padding: '8px',
    border: '1px solid #CCCCCC',
    whiteSpace: 'nowrap' as const,
  };

  const dateRangeStyle = {
    backgroundColor: '#E8F0F8',
    color: '#333333',
    fontWeight: 'bold' as const,
    fontSize: '14px',
    textAlign: 'center' as const,
    verticalAlign: 'middle' as const,
    padding: '8px',
    border: '1px solid #CCCCCC',
    whiteSpace: 'nowrap' as const,
  };

  const metadataStyle = {
    backgroundColor: '#F5F5F5',
    color: '#333333',
    fontWeight: 'bold' as const,
    fontSize: '12px',
    textAlign: 'left' as const,
    verticalAlign: 'middle' as const,
    padding: '8px',
    border: '1px solid #CCCCCC',
    whiteSpace: 'nowrap' as const,
  };

  const labelStyle = {
    backgroundColor: '#F0F8FF',
    color: '#333333',
    fontWeight: 'bold' as const,
    fontSize: '12px',
    textAlign: 'center' as const,
    verticalAlign: 'middle' as const,
    padding: '8px',
    border: '1px solid #CCCCCC',
    whiteSpace: 'nowrap' as const,
  };

  const rowLabelStyle = {
    backgroundColor: '#F5F5F5',
    color: '#333333',
    fontWeight: 'bold' as const,
    fontSize: '12px',
    textAlign: 'center' as const,
    verticalAlign: 'middle' as const,
    padding: '8px',
    border: '1px solid #CCCCCC',
    whiteSpace: 'nowrap' as const,
  };

  const cellStyle = {
    color: '#333333',
    fontSize: '12px',
    textAlign: 'center' as const,
    verticalAlign: 'middle' as const,
    padding: '8px',
    border: '1px solid #CCCCCC',
    whiteSpace: 'nowrap' as const,
  };

  const totalStyle = {
    backgroundColor: '#E8F0F8',
    color: '#333333',
    fontWeight: 'bold' as const,
    fontSize: '13px',
    textAlign: 'center' as const,
    verticalAlign: 'middle' as const,
    padding: '8px',
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
        }
        .preview-table col:first-child {
          min-width: 180px;
        }
        .preview-table col:last-child {
          min-width: 120px;
        }
        .preview-table td:not(:first-child):not(:last-child) {
          min-width: 80px;
        }
      `}</style>
      <div className="preview-container w-full">
        <div className="preview-scroll">
          <table className="preview-table">
          <colgroup>
            <col />
            {data.dateLabels.map((_, i) => (
              <col key={i} />
            ))}
            <col />
          </colgroup>
          <tbody>
            <tr>
              <td colSpan={totalColumn} style={headerStyle}>
                {data.locationLabel}
              </td>
            </tr>
            <tr>
              <td colSpan={totalColumn} style={titleStyle}>
                MONTHLY WORK DURATION REPORT
              </td>
            </tr>
            <tr>
              <td colSpan={totalColumn} style={dateRangeStyle}>
                {data.formattedFromDate.toUpperCase()} TO {data.formattedToDate.toUpperCase()}
              </td>
            </tr>
            <tr>
              <td colSpan={totalColumn} style={{ border: 'none', height: '16px' }}></td>
            </tr>
            {data.employeeReports.map((emp: MonthlyEmployeeReport, empIndex: number) => (
              <React.Fragment key={empIndex}>
                <tr>
                  <td colSpan={totalColumn} style={{ ...metadataStyle, textAlign: 'left' }}>
                    <span style={{ display: 'inline-block', width: '40%' }}>CODE: {emp.code}</span>
                    <span style={{ display: 'inline-block', width: '60%' }}>NAME: {emp.name}</span>
                  </td>
                </tr>
                <tr>
                  <td style={labelStyle}></td>
                  {data.dateLabels.map((label, i) => (
                    <td key={i} style={labelStyle}>
                      {label}
                    </td>
                  ))}
                  <td style={totalStyle}>TOTAL</td>
                </tr>
                <tr>
                  <td style={rowLabelStyle}>IN</td>
                  {emp.inTimes.map((value, i) => (
                    <td key={i} style={cellStyle}>
                      {value}
                    </td>
                  ))}
                  <td style={cellStyle}></td>
                </tr>
                <tr>
                  <td style={rowLabelStyle}>OUT</td>
                  {emp.outTimes.map((value, i) => (
                    <td key={i} style={cellStyle}>
                      {value}
                    </td>
                  ))}
                  <td style={cellStyle}></td>
                </tr>
                <tr>
                  <td style={rowLabelStyle}>DURATION</td>
                  {emp.durations.map((value, i) => (
                    <td key={i} style={cellStyle}>
                      {value}
                    </td>
                  ))}
                  <td style={totalStyle}>{emp.totalDuration}</td>
                </tr>
                {empIndex < data.employeeReports.length - 1 && (
                  <tr>
                    <td colSpan={totalColumn} style={{ border: 'none', height: '16px' }}></td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
};
