import { collection, getDocs, query, orderBy, limit, startAfter, where, Timestamp } from 'firebase/firestore';
import { db } from '@/firebase/firebase';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';

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

const toDate = (logDate: any): Date | null => {
  if (!logDate) return null;
  if (logDate?.toDate) return logDate.toDate();
  if (logDate instanceof Date) return logDate;
  return null;
};

const SEARCH_LIMIT = 1000;

const buildQueryConstraints = (from: string, to: string, deviceIds: number[], cursor?: any) => {
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

export const exportAttendanceReport = async (fromDate: string, exportToDate: string, location: string): Promise<void> => {
  if (!fromDate || !exportToDate) return;

  try {
    // Fetch devices
    const devicesSnapshot = await getDocs(collection(db, 'devices'));
    const devicesMap: Record<string, string> = {};
    devicesSnapshot.forEach((doc) => {
      const data = doc.data();
      const key = (data.deviceId ?? '').toString().trim();
      if (key) devicesMap[key] = data.location ?? '';
    });

    const getDeviceIdsForLocation = (loc: string): number[] => {
      if (!loc) return [];
      return Object.entries(devicesMap)
        .filter(([, locationName]) => locationName === loc)
        .map(([deviceId]) => Number(deviceId))
        .filter((id) => !isNaN(id));
    };

    // Fetch all employees
    const employeesSnapshot = await getDocs(collection(db, 'employees'));
    const employees: any[] = [];
    employeesSnapshot.forEach((doc) => {
      const data = doc.data();
      employees.push({
        id: doc.id,
        employeeCode: data.employeeCode,
        employeeCodeInDevice: data.employeeCodeInDevice,
        employeeName: data.employeeName,
        designation: data.designation,
      });
    });

    // Fetch all punches in date range
    const deviceIds = getDeviceIdsForLocation(location);
    const constraints = buildQueryConstraints(fromDate, exportToDate, deviceIds);
    const snapshot = await getDocs(query(collection(db, 'rawPunches'), ...constraints));
    let punches: RawPunch[] = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    // Fetch leaves for week off detection
    const leavesSnapshot = await getDocs(collection(db, 'leaves'));
    const leaves: any[] = [];
    leavesSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.type === 'weekoff') {
        leaves.push({
          employeeCode: data.employeeCode,
          days: data.days ?? [],
        });
      }
    });

    // Fetch shifts for employee filtering
    const shiftsSnapshot = await getDocs(collection(db, 'shifts'));
    const shiftsByCode: Record<string, { fromDate: string; toDate: string }[]> = {};
    shiftsSnapshot.forEach((doc) => {
      const data = doc.data();
      const shiftEmployees: any[] = data.employees ?? [];
      shiftEmployees.forEach((emp) => {
        const code = (emp.employeeCode ?? '').toString().trim().toLowerCase();
        if (code) {
          if (!shiftsByCode[code]) shiftsByCode[code] = [];
          shiftsByCode[code].push({
            fromDate: emp.fromDate ?? '',
            toDate: emp.toDate ?? '',
          });
        }
      });
    });

    // Filter employees to those with at least one punch or an assigned shift in the date range
    const filteredEmployees = employees.filter((employee) => {
      const empCode = (employee.employeeCodeInDevice ?? employee.employeeCode ?? '').toString().trim().toLowerCase();
      if (!empCode) return false;

      const hasPunch = punches.some((p) => (p.userId ?? '').trim().toLowerCase() === empCode);
      if (hasPunch) return true;

      const shifts = shiftsByCode[empCode] ?? [];
      return shifts.some((s) => s.fromDate && s.toDate && s.fromDate <= exportToDate && s.toDate >= fromDate);
    });

    // Generate date range
    const startDate = new Date(fromDate);
    const endDate = new Date(exportToDate);
    const dateRange: string[] = [];
    const dateLabels: string[] = [];
    const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const dayOfMonth = d.getDate();
      const dayName = dayNames[d.getDay()];
      dateRange.push(dateStr);
      dateLabels.push(`${dayOfMonth}-${dayName}`);
    }

    // Helper function to calculate duration between two timestamps
    const calculateDuration = (inTime: Date, outTime: Date): string => {
      const diffMs = outTime.getTime() - inTime.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      return `${String(diffHours).padStart(2, '0')}:${String(diffMinutes).padStart(2, '0')}`;
    };

    // Helper function to format time as HH:MM
    const formatTimeHHMM = (date: Date): string => {
      const hours = String(date.getUTCHours()).padStart(2, '0');
      const minutes = String(date.getUTCMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    };

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Attendance Report');

    // Set column widths
    worksheet.getColumn(1).width = 12; // Column A row labels
    worksheet.getColumn(2).width = 8; // Column B first date / values
    for (let i = 3; i <= 34; i++) {
      worksheet.getColumn(i).width = 10; // Date columns
    }

    let currentRow = 1;

    // Global Header Section
    const locationLabel = (location || 'All Locations').toUpperCase();
    const formattedFromDate = new Date(fromDate + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const formattedToDate = new Date(exportToDate + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    // Calculate the end column based on date range
    const endColumn = 2 + dateLabels.length; // Start from column B (2) + number of dates

    // Row 1: Location (merged, bold, centered, with mild background color)
    worksheet.mergeCells(`A${currentRow}:${String.fromCharCode(64 + endColumn)}${currentRow}`);
    const locationCell = worksheet.getCell(`A${currentRow}`);
    locationCell.value = locationLabel;
    locationCell.font = { bold: true, size: 14, color: { argb: 'FF333333' } };
    locationCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7F3FF' } };
    locationCell.alignment = { horizontal: 'center', vertical: 'middle' };
    currentRow++;

    // Row 2: Report Title (merged, bold, centered, with mild background color)
    worksheet.mergeCells(`A${currentRow}:${String.fromCharCode(64 + endColumn)}${currentRow}`);
    const titleCell = worksheet.getCell(`A${currentRow}`);
    titleCell.value = 'MONTHLY WORK DURATION REPORT';
    titleCell.font = { bold: true, size: 16, color: { argb: 'FF333333' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4F8' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    currentRow++;

    // Row 3: Date Range (merged, bold, centered, with mild background color)
    worksheet.mergeCells(`A${currentRow}:${String.fromCharCode(64 + endColumn)}${currentRow}`);
    const dateRangeCell = worksheet.getCell(`A${currentRow}`);
    dateRangeCell.value = `${formattedFromDate.toUpperCase()} TO ${formattedToDate.toUpperCase()}`;
    dateRangeCell.font = { bold: true, size: 12, color: { argb: 'FF333333' } };
    dateRangeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0F8' } };
    dateRangeCell.alignment = { horizontal: 'center', vertical: 'middle' };
    currentRow++;

    // Empty row separator
    currentRow++;

    // Process each employee
    for (const employee of filteredEmployees) {
      const empCode = (employee.employeeCodeInDevice ?? employee.employeeCode ?? '').toString().trim().toLowerCase();
      if (!empCode) continue;

      // Get punches for this employee
      const empPunches = punches.filter((p) => (p.userId ?? '').trim().toLowerCase() === empCode);

      // Get week off days for this employee
      const empLeave = leaves.find((l) => (l.employeeCode ?? '').toString().trim().toLowerCase() === empCode);
      const weekOffDays = empLeave?.days ?? [];

      // Row 1: Metadata (Employee Code and Name - merged cells with reduced width)
      worksheet.mergeCells(`A${currentRow}:E${currentRow}`);
      const codeCell = worksheet.getCell(`A${currentRow}`);
      codeCell.value = `CODE: ${(employee.employeeCode ?? employee.employeeCodeInDevice ?? '').toString().toUpperCase()}`;
      codeCell.font = { bold: true, size: 10, color: { argb: 'FF333333' } };
      codeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
      codeCell.alignment = { horizontal: 'left', vertical: 'middle' };

      worksheet.mergeCells(`F${currentRow}:I${currentRow}`);
      const nameCell = worksheet.getCell(`F${currentRow}`);
      nameCell.value = `NAME: ${(employee.employeeName ?? '').toString().toUpperCase()}`;
      nameCell.font = { bold: true, size: 10, color: { argb: 'FF333333' } };
      nameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
      nameCell.alignment = { horizontal: 'left', vertical: 'middle' };
      currentRow++;

      // Row 2: Date labels
      const dateRow = worksheet.getRow(currentRow);
      dateLabels.forEach((label, i) => {
        if (i + 2 <= 34) {
          dateRow.getCell(i + 2).value = label;
          dateRow.getCell(i + 2).font = { bold: true, size: 10, color: { argb: 'FF333333' } };
          dateRow.getCell(i + 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F8FF' } };
          dateRow.getCell(i + 2).alignment = { horizontal: 'center', vertical: 'middle' };
        }
      });
      dateRow.getCell(34).value = 'TOTAL';
      dateRow.getCell(34).font = { bold: true, size: 10, color: { argb: 'FF333333' } };
      dateRow.getCell(34).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0F8' } };
      dateRow.getCell(34).alignment = { horizontal: 'center', vertical: 'middle' };
      dateRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F8FF' } };
      currentRow++;

      // Initialize rows with labels in Column A
      const inTimeRow = worksheet.getRow(currentRow);
      inTimeRow.getCell(1).value = 'IN';
      inTimeRow.getCell(1).font = { bold: true, size: 10, color: { argb: 'FF333333' } };
      inTimeRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
      inTimeRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

      const outTimeRow = worksheet.getRow(currentRow + 1);
      outTimeRow.getCell(1).value = 'OUT';
      outTimeRow.getCell(1).font = { bold: true, size: 10, color: { argb: 'FF333333' } };
      outTimeRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
      outTimeRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

      const durationRow = worksheet.getRow(currentRow + 2);
      durationRow.getCell(1).value = 'DURATION';
      durationRow.getCell(1).font = { bold: true, size: 10, color: { argb: 'FF333333' } };
      durationRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
      durationRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

      let totalDurationMinutes = 0;

      // Process each day
      dateRange.forEach((dateStr, dayIndex) => {
        if (dayIndex + 2 > 34) return;

        const dayPunches = empPunches.filter((p) => {
          const d = toDate(p.logDate);
          if (!d) return false;
          return d.toISOString().split('T')[0] === dateStr;
        });

        // Check if it's a week off
        const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay();
        const isWeekOff = weekOffDays.includes(dayOfWeek.toString());

        const colIndex = dayIndex + 2;

        if (isWeekOff || dayPunches.length === 0) {
          inTimeRow.getCell(colIndex).value = '00:00';
          inTimeRow.getCell(colIndex).alignment = { horizontal: 'center', vertical: 'middle' };
          outTimeRow.getCell(colIndex).value = '00:00';
          outTimeRow.getCell(colIndex).alignment = { horizontal: 'center', vertical: 'middle' };
          durationRow.getCell(colIndex).value = '00:00';
          durationRow.getCell(colIndex).alignment = { horizontal: 'center', vertical: 'middle' };
        } else {
          // Get first in time and last out time
          const sortedPunches = dayPunches.sort((a, b) => {
            const dA = toDate(a.logDate);
            const dB = toDate(b.logDate);
            if (!dA || !dB) return 0;
            return dA.getTime() - dB.getTime();
          });

          const firstIn = sortedPunches.find((p) => p.direction === 'in')?.logDate;
          const lastOut = sortedPunches.filter((p) => p.direction === 'out').pop()?.logDate;

          const inDate = toDate(firstIn);
          const outDate = toDate(lastOut);

          inTimeRow.getCell(colIndex).value = inDate ? formatTimeHHMM(inDate) : '00:00';
          inTimeRow.getCell(colIndex).alignment = { horizontal: 'center', vertical: 'middle' };
          outTimeRow.getCell(colIndex).value = outDate ? formatTimeHHMM(outDate) : '00:00';
          outTimeRow.getCell(colIndex).alignment = { horizontal: 'center', vertical: 'middle' };

          if (inDate && outDate) {
            const duration = calculateDuration(inDate, outDate);
            durationRow.getCell(colIndex).value = duration;
            durationRow.getCell(colIndex).alignment = { horizontal: 'center', vertical: 'middle' };
            const [hours, minutes] = duration.split(':').map(Number);
            totalDurationMinutes += hours * 60 + minutes;
          } else {
            durationRow.getCell(colIndex).value = '00:00';
            durationRow.getCell(colIndex).alignment = { horizontal: 'center', vertical: 'middle' };
          }
        }
      });

      // Calculate total duration
      const totalHours = Math.floor(totalDurationMinutes / 60);
      const totalMins = totalDurationMinutes % 60;
      durationRow.getCell(34).value = `${String(totalHours).padStart(2, '0')}:${String(totalMins).padStart(2, '0')}`;
      durationRow.getCell(34).font = { bold: true, size: 11, color: { argb: 'FF333333' } };
      durationRow.getCell(34).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0F8' } };
      durationRow.getCell(34).alignment = { horizontal: 'center', vertical: 'middle' };

      currentRow += 3;

      // Empty row separator between employees
      currentRow++;
    }

    // Apply borders to all populated cells
    const thinBorder = { style: 'thin' as const, color: { argb: 'FFCCCCCC' } };
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (!cell.border) {
          cell.border = {
            top: thinBorder,
            left: thinBorder,
            bottom: thinBorder,
            right: thinBorder,
          };
        }
      });
    });

    // Generate Excel file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `work_duration_report_${fromDate}_to_${exportToDate}.xlsx`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error('Error exporting data:', error);
  }
};

export const exportDailyAttendanceRecords = async (fromDate: string, exportToDate: string, location: string): Promise<void> => {
  if (!fromDate || !exportToDate) return;

  try {
    const devicesSnapshot = await getDocs(collection(db, 'devices'));
    const devicesMap: Record<string, string> = {};
    devicesSnapshot.forEach((doc) => {
      const data = doc.data();
      const key = (data.deviceId ?? '').toString().trim();
      if (key) devicesMap[key] = data.location ?? '';
    });

    const getDeviceIdsForLocation = (loc: string): number[] => {
      if (!loc) return [];
      return Object.entries(devicesMap)
        .filter(([, locationName]) => locationName === loc)
        .map(([deviceId]) => Number(deviceId))
        .filter((id) => !isNaN(id));
    };

    const resolveDeviceLocation = (deviceId?: number): string => {
      if (!deviceId) return '';
      return devicesMap[String(deviceId)] ?? String(deviceId);
    };

    const employeesSnapshot = await getDocs(collection(db, 'employees'));
    const employeeMap: Record<string, string> = {};
    const departmentMap: Record<string, string> = {};
    employeesSnapshot.forEach((doc) => {
      const data = doc.data();
      const key = (data.employeeCodeInDevice ?? '').toString().trim().toLowerCase();
      if (key) {
        employeeMap[key] = data.employeeName ?? '';
        departmentMap[key] = data.department ?? '';
      }
    });

    const shiftsSnapshot = await getDocs(collection(db, 'shifts'));
    const shiftsMap: Record<string, any[]> = {};
    shiftsSnapshot.forEach((doc) => {
      const data = doc.data();
      const employees: any[] = data.employees ?? [];
      employees.forEach((emp) => {
        const code = (emp.employeeCode ?? '').toString().trim().toLowerCase();
        if (code) {
          if (!shiftsMap[code]) shiftsMap[code] = [];
          shiftsMap[code].push({
            name: data.name ?? '',
            startTime: data.startTime,
            endTime: data.endTime,
            fromDate: emp.fromDate,
            toDate: emp.toDate,
          });
        }
      });
    });

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

    const deviceIds = getDeviceIdsForLocation(location);
    const allPunches: RawPunch[] = [];
    let cursor: any = null;
    while (true) {
      const constraints = buildQueryConstraints(fromDate, exportToDate, deviceIds, cursor);
      const snapshot = await getDocs(query(collection(db, 'rawPunches'), ...constraints));
      const data: RawPunch[] = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      allPunches.push(...data);
      if (snapshot.docs.length < SEARCH_LIMIT) break;
      cursor = snapshot.docs[snapshot.docs.length - 1];
    }

    const groups: Record<string, RawPunch[]> = {};
    allPunches.forEach((punch) => {
      const d = toDate(punch.logDate);
      if (!d || !punch.userId) return;
      const dateKey = `${punch.userId.trim().toLowerCase()}_${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(punch);
    });

    const dailyRecords = Object.values(groups).map((punches) => {
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
      }

      const locationPunch = firstIn ?? firstPunch;

      return {
        userId,
        employeeName: employeeMap[key] ?? '',
        department: departmentMap[key] ?? '',
        location: resolveDeviceLocation(locationPunch.deviceId),
        shift,
        date,
        inTime: inDate,
        outTime: outDate,
        workingDurationMinutes,
        lateMinutes,
        earlyMinutes,
        overtimeMinutes,
      };
    });

    const formatTimeHHMM = (date: Date | null): string => {
      if (!date) return '';
      const hours = String(date.getUTCHours()).padStart(2, '0');
      const minutes = String(date.getUTCMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    };

    const formatMinutes = (minutes: number): string => {
      if (!isFinite(minutes) || minutes <= 0) return '';
      const h = Math.floor(minutes / 60);
      const m = Math.round(minutes % 60);
      if (h === 0) return `${m}m`;
      if (m === 0) return `${h}h`;
      return `${h}h ${m}m`;
    };

    const headers = [
      'Employee ID',
      'Employee Name',
      'Department',
      'Location',
      'Shift',
      'Date',
      'In Time',
      'Out Time',
      'Working Duration',
      'Late Minutes',
      'Early Minutes',
      'Overtime Minutes',
    ];
    const rows = dailyRecords.map((record) => [
      record.userId,
      record.employeeName,
      record.department,
      record.location,
      record.shift ? record.shift.name || `${record.shift.startTime} - ${record.shift.endTime}` : '',
      record.date ? record.date.toISOString().split('T')[0] : '',
      record.inTime ? formatTimeHHMM(record.inTime) : '',
      record.outTime ? formatTimeHHMM(record.outTime) : '',
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
    XLSX.writeFile(wb, `attendance-${fromDate}-to-${exportToDate}.xlsx`);
  } catch (error) {
    console.error('Error exporting daily attendance records:', error);
  }
};
