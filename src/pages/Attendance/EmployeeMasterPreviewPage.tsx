import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getEmployeeMasterData, EmployeeMasterData } from '@/utils/attendanceExport';
import { RedSpinner } from '@/components/common';

export const EmployeeMasterPreviewPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const location = searchParams.get('location') ?? '';

  const [data, setData] = useState<EmployeeMasterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const reportData = await getEmployeeMasterData(location);
        setData(reportData);
      } catch (err) {
        setError('Failed to load preview.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [location]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <RedSpinner />
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

  const headers = [
    'Employee Code',
    'Device Code',
    'Employee ID',
    'Employee Name',
    'Official Email',
    'Username',
    'Login ID',
    'Date of Joining',
    'Employment Type',
    'Designation',
    'Sub Designation',
    'Department',
    'Grade',
    'Group',
    'Reporting Manager',
    'Work Location',
    'Probation Period',
    'Confirmation Date',
    'Employment Status',
    'Last Synced',
  ];

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

  const fixedCellStyle = {
    color: '#333333',
    fontSize: '14px',
    textAlign: 'left' as const,
    verticalAlign: 'middle' as const,
    padding: '10px',
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
      `}</style>
      <div className="preview-container w-full">
        <div className="preview-scroll">
          <table className="preview-table">
            <thead>
              <tr>
                <td colSpan={headers.length} style={titleStyle}>
                  EMPLOYEE MASTER
                </td>
              </tr>
              <tr>
                {headers.map((header) => (
                  <th key={header} style={fixedHeaderStyle}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.employees.map((emp, rowIndex) => (
                <tr key={rowIndex}>
                  <td style={fixedCellStyle}>{emp.employeeCode}</td>
                  <td style={fixedCellStyle}>{emp.employeeCodeInDevice}</td>
                  <td style={fixedCellStyle}>{emp.employeeId}</td>
                  <td style={fixedCellStyle}>{emp.employeeName}</td>
                  <td style={fixedCellStyle}>{emp.officialEmail}</td>
                  <td style={fixedCellStyle}>{emp.username}</td>
                  <td style={fixedCellStyle}>{emp.loginId}</td>
                  <td style={fixedCellStyle}>{emp.dateOfJoining}</td>
                  <td style={fixedCellStyle}>{emp.employmentType}</td>
                  <td style={fixedCellStyle}>{emp.designation}</td>
                  <td style={fixedCellStyle}>{emp.subDesignation}</td>
                  <td style={fixedCellStyle}>{emp.department}</td>
                  <td style={fixedCellStyle}>{emp.grade}</td>
                  <td style={fixedCellStyle}>{emp.group}</td>
                  <td style={fixedCellStyle}>{emp.reportingManager}</td>
                  <td style={fixedCellStyle}>{emp.workLocation}</td>
                  <td style={fixedCellStyle}>{emp.probationPeriod}</td>
                  <td style={fixedCellStyle}>{emp.confirmationDate}</td>
                  <td style={fixedCellStyle}>{emp.employmentStatus}</td>
                  <td style={fixedCellStyle}>{emp.lastSynced}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
