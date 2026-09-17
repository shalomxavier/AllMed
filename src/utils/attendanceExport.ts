import { collection, getDocs, query, orderBy, limit, where, startAfter, Timestamp } from 'firebase/firestore';
import { db } from '@/firebase/firebase';
import ExcelJS from 'exceljs';

const worksheetColumnLetter = (col: number): string => {
  let result = '';
  let n = col;
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
};

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

export interface MonthlyEmployeeReport {
  employee: any;
  code: string;
  name: string;
  dateLabels: string[];
  inTimes: string[];
  outTimes: string[];
  durations: string[];
  totalDuration: string;
  overtimeDuration: string;
  lateDuration: string;
  earlyOutDuration: string;
}

export interface MonthlyReportData {
  locationLabel: string;
  formattedFromDate: string;
  formattedToDate: string;
  dateRange: string[];
  dateLabels: string[];
  employeeReports: MonthlyEmployeeReport[];
}


const formatTimeHHMM = (date: Date): string => {
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const formatDurationMinutes = (totalMinutes: number): string => {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const getLeaveCode = (type: string, reason: string): string => {
  if (type === 'weekoff') return 'WO';
  const r = (reason ?? '').toString().trim();
  if (!r) return '';
  const words = r.split(/\s+/).filter((w) => w.length > 0);
  const initials = words.map((w) => w[0].toUpperCase()).join('');
  return initials.slice(0, 4);
};

export const getMonthlyReportData = async (fromDate: string, exportToDate: string, location: string): Promise<MonthlyReportData | null> => {
  if (!fromDate || !exportToDate) return null;

  // Fetch all employees and build workLocationMap
  const employeesSnapshot = await getDocs(collection(db, 'employees'));
  const employees: any[] = [];
  const workLocationMap: Record<string, string> = {};
  employeesSnapshot.forEach((doc) => {
    const data = doc.data();
    const empCode = data.employeeCode;
    if (empCode && data.workLocation) {
      workLocationMap[empCode] = data.workLocation;
    }
    employees.push({
      id: doc.id,
      employeeCode: data.employeeCode,
      employeeCodeInDevice: data.employeeCodeInDevice,
      employeeName: data.employeeName,
      designation: data.designation,
      workLocation: data.workLocation,
      employmentStatus: data.employmentStatus,
    });
  });

  // Filter employees by branch if location is specified
  const branchFilteredEmployees = location 
    ? employees.filter((e) => e.workLocation === location)
    : employees;

  // Get employee codes for filtering punches
  const employeeCodes = branchFilteredEmployees.flatMap((employee) =>
    [employee.employeeCode, employee.employeeCodeInDevice]
      .filter(Boolean)
      .map((code) => code.toString())
  );

  const punches = await fetchRawPunchesForEmployees(fromDate, exportToDate, employeeCodes);

  // Fetch leaves (including week offs) and build a per-employee, per-date abbreviation map
  const leavesSnapshot = await getDocs(collection(db, 'leaves'));
  const leaveMap: Record<string, Record<string, string>> = {};
  leavesSnapshot.forEach((doc) => {
    const data = doc.data();
    const empCode = (data.employeeCode ?? '').toString().trim().toLowerCase();
    if (!empCode) return;

    const type = data.type ?? '';
    const reason = data.reason ?? '';
    const code = getLeaveCode(type, reason);
    if (!code) return;

    const leaveDates = new Set<string>();
    const dates: string[] = data.dates ?? [];
    if (dates.length > 0) {
      dates.forEach((d) => leaveDates.add(d));
    } else {
      const from = data.fromDate;
      const to = data.toDate;
      if (from && to) {
        const leaveStart = new Date(from + 'T00:00:00Z');
        const leaveEnd = new Date(to + 'T00:00:00Z');
        for (let d = new Date(leaveStart); d <= leaveEnd; d.setDate(d.getDate() + 1)) {
          leaveDates.add(d.toISOString().split('T')[0]);
        }
      }
    }

    if (!leaveMap[empCode]) leaveMap[empCode] = {};
    leaveDates.forEach((dateStr) => {
      if (dateStr >= fromDate && dateStr <= exportToDate) {
        leaveMap[empCode][dateStr] = code;
      }
    });
  });

  // Fetch shifts for employee filtering
  const shiftsSnapshot = await getDocs(collection(db, 'shifts'));
  const shiftsByCode: Record<string, { fromDate: string; toDate: string; startTime: string; endTime: string }[]> = {};
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
          startTime: data.startTime ?? '',
          endTime: data.endTime ?? '',
        });
      }
    });
  });

  // Filter employees to those with at least one punch or an assigned shift in the date range
  const filteredEmployees = branchFilteredEmployees.filter((employee) => {
    const empCode = (employee.employeeCodeInDevice ?? employee.employeeCode ?? '').toString().trim().toLowerCase();
    if (!empCode) return false;

    const recordCodes = [employee.employeeCode, employee.employeeCodeInDevice]
      .filter(Boolean)
      .map((code) => code.toString().trim().toLowerCase());
    const hasPunch = punches.some((p) => recordCodes.includes((p.userId ?? '').trim().toLowerCase()));
    if (hasPunch) return true;
    if ((employee.employmentStatus ?? '').toString().trim().toLowerCase() === 'inactive') return false;

    const shiftCode = (employee.employeeCode ?? empCode).toString().trim().toLowerCase();
    const shifts = shiftsByCode[shiftCode] ?? [];
    return shifts.some((s) => s.fromDate && s.toDate && s.fromDate <= exportToDate && s.toDate >= fromDate);
  });

  // Generate date range
  const startDate = new Date(fromDate + 'T00:00:00Z');
  const endDate = new Date(exportToDate + 'T00:00:00Z');
  const dateRange: string[] = [];
  const dateLabels: string[] = [];

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    const day = String(d.getDate()).padStart(2, '0');
    const month = d.toLocaleDateString('en-GB', { month: 'short' });
    const year = String(d.getFullYear()).slice(-2);
    dateRange.push(dateStr);
    dateLabels.push(`${day}-${month}-${year}`);
  }

  const locationLabel = (location || 'All Locations').toUpperCase();
  const formattedFromDate = new Date(fromDate + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const formattedToDate = new Date(exportToDate + 'T00:00:00Z').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const employeeReports: MonthlyEmployeeReport[] = [];

  for (const employee of filteredEmployees) {
    const empCode = (employee.employeeCodeInDevice ?? employee.employeeCode ?? '').toString().trim().toLowerCase();
    if (!empCode) continue;

    const recordCodes = [employee.employeeCode, employee.employeeCodeInDevice]
      .filter(Boolean)
      .map((code) => code.toString().trim().toLowerCase());
    const empPunches = punches.filter((p) => recordCodes.includes((p.userId ?? '').trim().toLowerCase()));
    const leaveCode = (employee.employeeCode ?? empCode).toString().trim().toLowerCase();
    const empLeaveMap = leaveMap[leaveCode] ?? {};

    const code = (employee.employeeCode ?? employee.employeeCodeInDevice ?? '').toString().toUpperCase();
    const name = (employee.employeeName ?? '').toString().toUpperCase();

    const inTimes: string[] = [];
    const outTimes: string[] = [];
    const durations: string[] = [];
    let totalDurationMinutes = 0;
    let overtimeMinutes = 0;
    let lateMinutes = 0;
    let earlyOutMinutes = 0;
    const shiftCode = (employee.employeeCode ?? empCode).toString().trim().toLowerCase();
    const employeeShifts = shiftsByCode[shiftCode] ?? [];

    // Track punch IDs already claimed by a previous night-shift date
    const claimedPunchIds = new Set<string>();

    dateRange.forEach((dateStr) => {
      const dayPunches = empPunches.filter((p) => {
        if (claimedPunchIds.has(p.id)) return false;
        const d = toDate(p.logDate);
        if (!d) return false;
        return d.toISOString().split('T')[0] === dateStr;
      });

      const leaveCode = empLeaveMap[dateStr];

      if (leaveCode) {
        inTimes.push(leaveCode);
        outTimes.push(leaveCode);
        durations.push(leaveCode);
      } else if (dayPunches.length === 0) {
        inTimes.push('');
        outTimes.push('');
        durations.push('');
      } else {
        const shift = employeeShifts.find((item) => dateStr >= item.fromDate && dateStr <= item.toDate);
        const nightShift = shift && shift.startTime && shift.endTime &&
          (() => { const [sh, sm] = shift.startTime.split(':').map(Number); const [eh, em] = shift.endTime.split(':').map(Number); return (eh * 60 + em) <= (sh * 60 + sm); })();

        // For night shifts, also pull next-day OUT punches into this day
        if (nightShift && shift) {
          const nextDay = new Date(dateStr + 'T00:00:00Z');
          nextDay.setUTCDate(nextDay.getUTCDate() + 1);
          const nextDateStr = nextDay.toISOString().split('T')[0];
          const [eh, em] = shift.endTime.split(':').map(Number);
          const shiftEndMin = eh * 60 + em;
          const cutoffMin = shiftEndMin + 120;

          const nextDayOutPunches = empPunches.filter((p) => {
            if (claimedPunchIds.has(p.id)) return false;
            if (p.direction !== 'out') return false;
            const d = toDate(p.logDate);
            if (!d) return false;
            if (d.toISOString().split('T')[0] !== nextDateStr) return false;
            const pMin = d.getUTCHours() * 60 + d.getUTCMinutes();
            return pMin <= cutoffMin;
          });
          nextDayOutPunches.forEach((p) => {
            dayPunches.push(p);
            claimedPunchIds.add(p.id);
          });
        }

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

        inTimes.push(inDate ? formatTimeHHMM(inDate) : '');
        outTimes.push(outDate ? formatTimeHHMM(outDate) : '');

        if (inDate && outDate) {
          let diffMs = outDate.getTime() - inDate.getTime();
          if (diffMs < 0) {
            // Fallback: wall-clock wrap around midnight
            const inMin = inDate.getUTCHours() * 60 + inDate.getUTCMinutes();
            const outMin = outDate.getUTCHours() * 60 + outDate.getUTCMinutes();
            diffMs = (outMin + 24 * 60 - inMin) * 60 * 1000;
          }
          const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
          const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
          const duration = `${String(diffHours).padStart(2, '0')}:${String(diffMinutes).padStart(2, '0')}`;
          durations.push(duration);
          totalDurationMinutes += diffHours * 60 + diffMinutes;
        } else {
          durations.push('');
        }

        if (shift && inDate) {
          const [startHour, startMinute] = shift.startTime.split(':').map(Number);
          const shiftStartMinutes = startHour * 60 + startMinute;
          const actualInMinutes = inDate.getUTCHours() * 60 + inDate.getUTCMinutes();
          if (Number.isFinite(shiftStartMinutes) && actualInMinutes > shiftStartMinutes) {
            lateMinutes += actualInMinutes - shiftStartMinutes;
          }
        }
        if (shift && outDate) {
          const [endHour, endMinute] = shift.endTime.split(':').map(Number);
          const shiftEndMinutes = endHour * 60 + endMinute;
          const actualOutMinutes = outDate.getUTCHours() * 60 + outDate.getUTCMinutes();
          if (Number.isFinite(shiftEndMinutes)) {
            if (nightShift) {
              // For night shifts, OUT is next morning — compare wall-clock times
              if (actualOutMinutes < shiftEndMinutes) {
                earlyOutMinutes += shiftEndMinutes - actualOutMinutes;
              } else if (actualOutMinutes > shiftEndMinutes) {
                overtimeMinutes += actualOutMinutes - shiftEndMinutes;
              }
            } else {
              if (actualOutMinutes < shiftEndMinutes) {
                earlyOutMinutes += shiftEndMinutes - actualOutMinutes;
              } else if (actualOutMinutes > shiftEndMinutes) {
                overtimeMinutes += actualOutMinutes - shiftEndMinutes;
              }
            }
          }
        }
      }
    });

    const totalDuration = formatDurationMinutes(totalDurationMinutes);

    employeeReports.push({
      employee,
      code,
      name,
      dateLabels,
      inTimes,
      outTimes,
      durations,
      totalDuration,
      overtimeDuration: formatDurationMinutes(overtimeMinutes),
      lateDuration: formatDurationMinutes(lateMinutes),
      earlyOutDuration: formatDurationMinutes(earlyOutMinutes),
    });
  }

  return {
    locationLabel,
    formattedFromDate,
    formattedToDate,
    dateRange,
    dateLabels,
    employeeReports,
  };
};

export const exportAttendanceReport = async (fromDate: string, exportToDate: string, location: string): Promise<void> => {
  const reportData = await getMonthlyReportData(fromDate, exportToDate, location);
  if (!reportData) return;

  const { locationLabel, formattedFromDate, formattedToDate, dateLabels, employeeReports } = reportData;

  try {

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Attendance Report');

    // Set column widths
    worksheet.getColumn(1).width = 50; // Column A row labels (increased for header text)
    for (let i = 2; i <= 1 + dateLabels.length; i++) {
      worksheet.getColumn(i).width = 10; // Date columns
    }
    for (let i = 2 + dateLabels.length; i <= 5 + dateLabels.length; i++) {
      worksheet.getColumn(i).width = 15;
    }
    for (let i = 6 + dateLabels.length; i <= 34; i++) {
      worksheet.getColumn(i).hidden = true;
    }

    let currentRow = 1;

    // Global Header Section
    // These are already destructured from reportData

    // Row 1: Location (merged, bold, centered, with mild background color)
    worksheet.mergeCells(`A${currentRow}:AA${currentRow}`);
    const locationCell = worksheet.getCell(`A${currentRow}`);
    locationCell.value = locationLabel;
    locationCell.font = { bold: true, size: 14, color: { argb: 'FF333333' } };
    locationCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7F3FF' } };
    locationCell.alignment = { horizontal: 'center', vertical: 'middle' };
    currentRow++;

    // Row 2: Report Title (merged, bold, centered, with mild background color)
    worksheet.mergeCells(`A${currentRow}:AA${currentRow}`);
    const titleCell = worksheet.getCell(`A${currentRow}`);
    titleCell.value = 'MONTHLY WORK DURATION REPORT';
    titleCell.font = { bold: true, size: 16, color: { argb: 'FF333333' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4F8' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    currentRow++;

    // Row 3: Date Range (merged, bold, centered, with mild background color)
    worksheet.mergeCells(`A${currentRow}:AA${currentRow}`);
    const dateRangeCell = worksheet.getCell(`A${currentRow}`);
    dateRangeCell.value = `${formattedFromDate.toUpperCase()} TO ${formattedToDate.toUpperCase()}`;
    dateRangeCell.font = { bold: true, size: 12, color: { argb: 'FF333333' } };
    dateRangeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0F8' } };
    dateRangeCell.alignment = { horizontal: 'center', vertical: 'middle' };
    currentRow++;

    // Empty row separator
    currentRow++;

    // Process each employee
    const totalColumn = 2 + dateLabels.length;
    const overtimeColumn = totalColumn + 1;
    const lateColumn = totalColumn + 2;
    const earlyOutColumn = totalColumn + 3;
    for (const empReport of employeeReports) {
      // Row 1: Metadata (Employee Code and Name - merged cells with reduced width)
      worksheet.mergeCells(`A${currentRow}:E${currentRow}`);
      const codeCell = worksheet.getCell(`A${currentRow}`);
      codeCell.value = `CODE: ${empReport.code}`;
      codeCell.font = { bold: true, size: 10, color: { argb: 'FF333333' } };
      codeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
      codeCell.alignment = { horizontal: 'left', vertical: 'middle' };

      worksheet.mergeCells(`F${currentRow}:I${currentRow}`);
      const nameCell = worksheet.getCell(`F${currentRow}`);
      nameCell.value = `NAME: ${empReport.name}`;
      nameCell.font = { bold: true, size: 10, color: { argb: 'FF333333' } };
      nameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
      nameCell.alignment = { horizontal: 'left', vertical: 'middle' };
      currentRow++;

      // Row 2: Date labels
      const dateRow = worksheet.getRow(currentRow);
      dateLabels.forEach((label, i) => {
        dateRow.getCell(i + 2).value = label;
        dateRow.getCell(i + 2).font = { bold: true, size: 10, color: { argb: 'FF333333' } };
        dateRow.getCell(i + 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F8FF' } };
        dateRow.getCell(i + 2).alignment = { horizontal: 'center', vertical: 'middle' };
      });
      const summaryHeaders = [
        [totalColumn, 'TOTAL'],
        [overtimeColumn, 'OT'],
        [lateColumn, 'LATE'],
        [earlyOutColumn, 'EARLY OUT'],
      ] as const;
      summaryHeaders.forEach(([column, label]) => {
        dateRow.getCell(column).value = label;
        dateRow.getCell(column).font = { bold: true, size: 10, color: { argb: 'FF333333' } };
        dateRow.getCell(column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0F8' } };
        dateRow.getCell(column).alignment = { horizontal: 'center', vertical: 'middle' };
      });
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

      // Fill in data
      empReport.inTimes.forEach((value, i) => {
        const colIndex = i + 2;
        inTimeRow.getCell(colIndex).value = value;
        inTimeRow.getCell(colIndex).alignment = { horizontal: 'center', vertical: 'middle' };
      });
      empReport.outTimes.forEach((value, i) => {
        const colIndex = i + 2;
        outTimeRow.getCell(colIndex).value = value;
        outTimeRow.getCell(colIndex).alignment = { horizontal: 'center', vertical: 'middle' };
      });
      empReport.durations.forEach((value, i) => {
        const colIndex = i + 2;
        durationRow.getCell(colIndex).value = value;
        durationRow.getCell(colIndex).alignment = { horizontal: 'center', vertical: 'middle' };
      });

      const summaryValues = [
        [totalColumn, empReport.totalDuration],
        [overtimeColumn, empReport.overtimeDuration],
        [lateColumn, empReport.lateDuration],
        [earlyOutColumn, empReport.earlyOutDuration],
      ] as const;
      summaryValues.forEach(([column, value]) => {
        durationRow.getCell(column).value = value;
        durationRow.getCell(column).font = { bold: true, size: 11, color: { argb: 'FF333333' } };
        durationRow.getCell(column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0F8' } };
        durationRow.getCell(column).alignment = { horizontal: 'center', vertical: 'middle' };
      });

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

export interface DailyReportRecord {
  userId: string;
  employeeName: string;
  department: string;
  location: string;
  shift: string;
  date: string;
  inTime: string;
  outTime: string;
  workingDuration: string;
  lateMinutes: string;
  earlyMinutes: string;
  overtimeMinutes: string;
}

export interface DailyReportData {
  headers: string[];
  rows: DailyReportRecord[];
}

const fetchRawPunchesForEmployees = async (
  fromDate: string,
  exportToDate: string,
  employeeUserIds: string[]
): Promise<RawPunch[]> => {
  if (employeeUserIds.length === 0) return [];

  const baseConstraints: any[] = [orderBy('logDate', 'desc')];
  if (fromDate) {
    const fromTs = Timestamp.fromDate(new Date(fromDate + 'T00:00:00Z'));
    baseConstraints.push(where('logDate', '>=', fromTs));
  }
  if (exportToDate) {
    const toTs = Timestamp.fromDate(new Date(exportToDate + 'T23:59:59Z'));
    baseConstraints.push(where('logDate', '<=', toTs));
  }

  const seen = new Set<string>();
  const userIds: string[] = [];
  employeeUserIds.forEach((id) => {
    const trimmed = id.trim();
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    userIds.push(trimmed);
  });

  const allPunches: RawPunch[] = [];
  for (let i = 0; i < userIds.length; i += 30) {
    const chunk = userIds.slice(i, i + 30);
    if (chunk.length === 0) continue;
    let lastDoc: any = null;
    while (true) {
      const constraints = [...baseConstraints, where('userId', 'in', chunk), limit(SEARCH_LIMIT)];
      if (lastDoc) constraints.push(startAfter(lastDoc));
      const snapshot = await getDocs(query(collection(db, 'rawPunches'), ...constraints));
      allPunches.push(...snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      if (snapshot.docs.length < SEARCH_LIMIT) break;
      lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }
  }

  return allPunches;
};

export const getDailyReportData = async (fromDate: string, exportToDate: string, location: string): Promise<DailyReportData | null> => {
  if (!fromDate || !exportToDate) return null;

  // Fetch all employees and build lookup maps
  const employeesSnapshot = await getDocs(collection(db, 'employees'));
  const employeeMap: Record<string, string> = {};
  const departmentMap: Record<string, string> = {};
  const workLocationMap: Record<string, string> = {};
  const employees: any[] = [];

  employeesSnapshot.forEach((doc) => {
    const data = doc.data();
    const employee = {
      employeeCode: data.employeeCode,
      employeeCodeInDevice: data.employeeCodeInDevice,
      employeeName: data.employeeName,
      department: data.department,
      workLocation: data.workLocation,
    };
    employees.push(employee);

    const codes: string[] = [];
    if (employee.employeeCode) codes.push(employee.employeeCode.toString().trim());
    if (employee.employeeCodeInDevice) codes.push(employee.employeeCodeInDevice.toString().trim());
    codes.forEach((code) => {
      const key = code.toLowerCase();
      employeeMap[key] = employee.employeeName ?? '';
      departmentMap[key] = employee.department ?? '';
      workLocationMap[key] = employee.workLocation ?? '';
    });
  });

  // Filter employees by branch if location is specified
  const filteredEmployees = location
    ? employees.filter((e) => e.workLocation === location)
    : employees;

  // Build the set of userIds to query (employeeCode and/or employeeCodeInDevice)
  const seenUserIds = new Set<string>();
  const employeeUserIds: string[] = [];
  filteredEmployees.forEach((e) => {
    [e.employeeCode, e.employeeCodeInDevice].forEach((code) => {
      if (!code) return;
      const id = code.toString().trim();
      const key = id.toLowerCase();
      if (seenUserIds.has(key)) return;
      seenUserIds.add(key);
      employeeUserIds.push(id);
    });
  });

  const shiftsSnapshot = await getDocs(collection(db, 'shifts'));
  const shiftsMap: Record<string, any[]> = {};
  const deviceToEmployeeCode: Record<string, string> = {};

  shiftsSnapshot.forEach((doc) => {
    const data = doc.data();
    const shiftEmployees: any[] = data.employees ?? [];
    shiftEmployees.forEach((emp) => {
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

  employees.forEach((e) => {
    if (e.employeeCode && e.employeeCodeInDevice) {
      deviceToEmployeeCode[e.employeeCodeInDevice.toString().trim().toLowerCase()] =
        e.employeeCode.toString().trim().toLowerCase();
    }
  });

  const isNightShift = (shift: any): boolean => {
    if (!shift?.startTime || !shift?.endTime) return false;
    const [sh, sm] = shift.startTime.split(':').map(Number);
    const [eh, em] = shift.endTime.split(':').map(Number);
    return (eh * 60 + em) <= (sh * 60 + sm);
  };

  const getShiftForUser = (userId: string, dateStr: string): any | null => {
    if (!userId) return null;
    const key = userId.trim().toLowerCase();
    const shifts = shiftsMap[key] ?? shiftsMap[deviceToEmployeeCode[key]];
    if (!shifts || shifts.length === 0) return null;
    return shifts.find((s) => dateStr >= s.fromDate && dateStr <= s.toDate) ?? null;
  };

  const getShiftForPunch = (userId: string | undefined, logDate: any): any | null => {
    if (!userId) return null;
    const d = toDate(logDate);
    if (!d) return null;
    const punchDateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    return getShiftForUser(userId, punchDateStr);
  };

  const allPunches = await fetchRawPunchesForEmployees(fromDate, exportToDate, employeeUserIds);

  // Phase 1: Group punches by userId + calendar date
  const formatDateKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  const groups: Record<string, RawPunch[]> = {};
  allPunches.forEach((punch) => {
    const d = toDate(punch.logDate);
    if (!d || !punch.userId) return;
    const dateKey = `${punch.userId.trim().toLowerCase()}_${formatDateKey(d)}`;
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(punch);
  });

  // Phase 2: For night shifts, move next-day OUT punches into the IN-date group
  const movedPunchIds = new Set<string>();
  const allKeys = Object.keys(groups);
  for (const dateKey of allKeys) {
    const lastUnderscore = dateKey.lastIndexOf('_');
    const userKey = dateKey.substring(0, lastUnderscore);
    const dateStr = dateKey.substring(lastUnderscore + 1);
    const shift = getShiftForUser(userKey, dateStr);
    if (!shift || !isNightShift(shift)) continue;

    const nextDay = new Date(dateStr + 'T00:00:00Z');
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const nextDateStr = formatDateKey(nextDay);
    const nextKey = `${userKey}_${nextDateStr}`;
    const nextGroup = groups[nextKey];
    if (!nextGroup) continue;

    const [eh, em] = shift.endTime.split(':').map(Number);
    const shiftEndMin = eh * 60 + em;
    const cutoffMin = shiftEndMin + 120;

    const toMove: RawPunch[] = [];
    const toKeep: RawPunch[] = [];
    nextGroup.forEach((p) => {
      if (p.direction === 'out') {
        const pd = toDate(p.logDate);
        if (pd) {
          const pMin = pd.getUTCHours() * 60 + pd.getUTCMinutes();
          if (pMin <= cutoffMin) {
            toMove.push(p);
            return;
          }
        }
      }
      toKeep.push(p);
    });

    if (toMove.length > 0) {
      groups[dateKey] = [...groups[dateKey], ...toMove];
      toMove.forEach((p) => movedPunchIds.add(p.id));
      if (toKeep.length > 0) {
        groups[nextKey] = toKeep;
      } else {
        delete groups[nextKey];
      }
    }
  }

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
    } else if (inDate && outDate) {
      // Fallback for night shifts where timestamps may wrap around midnight
      const inMin = inDate.getUTCHours() * 60 + inDate.getUTCMinutes();
      const outMin = outDate.getUTCHours() * 60 + outDate.getUTCMinutes();
      if (outMin >= inMin) {
        workingDurationMinutes = outMin - inMin;
      } else {
        workingDurationMinutes = outMin + 24 * 60 - inMin;
      }
    }

    return {
      userId,
      employeeName: employeeMap[key] ?? '',
      department: departmentMap[key] ?? '',
      location: workLocationMap[key] ?? '',
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

  const localFormatTimeHHMM = (date: Date | null): string => {
    if (!date) return '';
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const localFormatMinutes = (minutes: number): string => {
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

  const rows: DailyReportRecord[] = dailyRecords.map((record) => ({
    userId: record.userId,
    employeeName: record.employeeName,
    department: record.department,
    location: record.location,
    shift: record.shift ? record.shift.name || `${record.shift.startTime} - ${record.shift.endTime}` : '',
    date: record.date ? record.date.toISOString().split('T')[0] : '',
    inTime: record.inTime ? localFormatTimeHHMM(record.inTime) : '',
    outTime: record.outTime ? localFormatTimeHHMM(record.outTime) : '',
    workingDuration: record.workingDurationMinutes > 0 ? localFormatMinutes(record.workingDurationMinutes) : '',
    lateMinutes: record.lateMinutes > 0 ? localFormatMinutes(record.lateMinutes) : '',
    earlyMinutes: record.earlyMinutes > 0 ? localFormatMinutes(record.earlyMinutes) : '',
    overtimeMinutes: record.overtimeMinutes > 0 ? localFormatMinutes(record.overtimeMinutes) : '',
  }));

  return { headers, rows };
};

export const exportDailyAttendanceRecords = async (fromDate: string, exportToDate: string, location: string): Promise<void> => {
  const reportData = await getDailyReportData(fromDate, exportToDate, location);
  if (!reportData) return;

  try {
    const { headers, rows } = reportData;
    const locationLabel = location === '' ? 'ALL LOCATIONS' : location.toUpperCase();

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Daily Attendance Report');

    const headerFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE7F3FF' } };
    const titleFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF0F4F8' } };
    const dateFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE8F0F8' } };
    const thinBorder = { style: 'thin' as const, color: { argb: 'FFCCCCCC' } };

    let currentRow = 1;

    // Title section
    worksheet.mergeCells(`A${currentRow}:L${currentRow}`);
    const locationCell = worksheet.getCell(`A${currentRow}`);
    locationCell.value = locationLabel;
    locationCell.font = { bold: true, size: 14, color: { argb: 'FF333333' } };
    locationCell.fill = titleFill;
    locationCell.alignment = { horizontal: 'center', vertical: 'middle' };
    currentRow++;

    worksheet.mergeCells(`A${currentRow}:L${currentRow}`);
    const titleCell = worksheet.getCell(`A${currentRow}`);
    titleCell.value = 'DAILY ATTENDANCE REPORT';
    titleCell.font = { bold: true, size: 16, color: { argb: 'FF333333' } };
    titleCell.fill = titleFill;
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    currentRow++;

    worksheet.mergeCells(`A${currentRow}:L${currentRow}`);
    const dateRangeCell = worksheet.getCell(`A${currentRow}`);
    dateRangeCell.value = `${fromDate.toUpperCase()} TO ${exportToDate.toUpperCase()}`;
    dateRangeCell.font = { bold: true, size: 12, color: { argb: 'FF333333' } };
    dateRangeCell.fill = dateFill;
    dateRangeCell.alignment = { horizontal: 'center', vertical: 'middle' };
    currentRow++;

    // Empty row
    currentRow++;

    // Header row
    const headerRow = worksheet.getRow(currentRow);
    headers.forEach((header, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = header;
      cell.font = { bold: true, size: 10, color: { argb: 'FF333333' } };
      cell.fill = headerFill;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
    });
    currentRow++;

    // Data rows
    rows.forEach((record) => {
      const row = worksheet.getRow(currentRow);
      const values = [
        record.userId,
        record.employeeName,
        record.department,
        record.location,
        record.shift,
        record.date,
        record.inTime,
        record.outTime,
        record.workingDuration,
        record.lateMinutes,
        record.earlyMinutes,
        record.overtimeMinutes,
      ];
      values.forEach((value, index) => {
        const cell = row.getCell(index + 1);
        cell.value = value;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
      });
      currentRow++;
    });

    // Column widths
    worksheet.getColumn(1).width = 15;
    worksheet.getColumn(2).width = 25;
    worksheet.getColumn(3).width = 18;
    worksheet.getColumn(4).width = 18;
    worksheet.getColumn(5).width = 25;
    worksheet.getColumn(6).width = 12;
    worksheet.getColumn(7).width = 12;
    worksheet.getColumn(8).width = 12;
    worksheet.getColumn(9).width = 16;
    worksheet.getColumn(10).width = 14;
    worksheet.getColumn(11).width = 14;
    worksheet.getColumn(12).width = 16;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `daily_attendance_report_${fromDate}_to_${exportToDate}.xlsx`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error('Error exporting daily attendance records:', error);
  }
};

export interface ShiftMatrixEmployee {
  code: string;
  name: string;
  designation: string;
  department: string;
  values: string[];
}

export interface ShiftReportData {
  dayNames: string[];
  dates: string[];
  dateLabels: string[];
  employees: ShiftMatrixEmployee[];
}

const formatTime12Compact = (time24: any): string => {
  if (!time24) return '';
  
  // Handle Firebase Timestamp objects
  if (time24 && typeof time24 === 'object' && 'toDate' in time24) {
    const date = time24.toDate();
    const h = date.getHours();
    const m = date.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    if (m === 0) return `${h12}${ampm}`;
    return `${h12}:${String(m).padStart(2, '0')}${ampm}`;
  }
  
  const [hStr, mStr] = String(time24).split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10) || 0;
  
  // Check if hour is valid (not NaN and within 0-23 range)
  if (isNaN(h) || h < 0 || h > 23) {
    console.warn('Invalid time format:', time24);
    return '';
  }
  
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  if (m === 0) return `${h12}${ampm}`;
  return `${h12}:${String(m).padStart(2, '0')}${ampm}`;
};

const formatShiftTime = (startTime: string, endTime: string): string => {
  if (!startTime || !endTime) return '';
  return `${formatTime12Compact(startTime)}-${formatTime12Compact(endTime)}`;
};

const generateDateRange = (fromDate: string, toDate: string): string[] => {
  const start = new Date(fromDate + 'T00:00:00Z');
  const end = new Date(toDate + 'T00:00:00Z');
  const dates: string[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
};

export const getShiftReportData = async (fromDate: string, exportToDate: string, location = ''): Promise<ShiftReportData | null> => {
  if (!fromDate || !exportToDate) return null;

  const dateRange = generateDateRange(fromDate, exportToDate);
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const employeesSnapshot = await getDocs(collection(db, 'employees'));
  const employeeMap: Record<string, { name: string; designation: string; department: string; employmentStatus: string; recordCodes: string[] }> = {};
  employeesSnapshot.forEach((doc) => {
    const data = doc.data();
    if (location && data.workLocation !== location) return;
    const code = (data.employeeCode ?? '').toString().trim().toLowerCase();
    if (code) {
      employeeMap[code] = {
        name: data.employeeName ?? '',
        designation: data.designation ?? '',
        department: data.department ?? '',
        employmentStatus: data.employmentStatus ?? '',
        recordCodes: [data.employeeCode, data.employeeCodeInDevice]
          .filter(Boolean)
          .map((value) => value.toString().trim().toLowerCase()),
      };
    }
  });

  const reportPunches = await fetchRawPunchesForEmployees(
    fromDate,
    exportToDate,
    Object.values(employeeMap).flatMap((employee) => employee.recordCodes)
  );
  const codesWithRecords = new Set(reportPunches.map((punch) => (punch.userId ?? '').trim().toLowerCase()));

  const shiftsSnapshot = await getDocs(collection(db, 'shifts'));
  const shiftAssignments: Record<string, Record<string, string>> = {};

  shiftsSnapshot.forEach((doc) => {
    const data = doc.data();
    const startTime = data.startTime ?? '';
    const endTime = data.endTime ?? '';
    const employees: any[] = data.employees ?? [];

    employees.forEach((emp) => {
      const empCode = (emp.employeeCode ?? '').toString().trim().toLowerCase();
      const empFromDate = emp.fromDate ?? '';
      const empToDate = emp.toDate ?? '';

      if (!empCode || !empFromDate || !empToDate) return;

      if (empToDate < fromDate || empFromDate > exportToDate) return;

      if (!shiftAssignments[empCode]) shiftAssignments[empCode] = {};

      dateRange.forEach((dateStr) => {
        if (dateStr >= empFromDate && dateStr <= empToDate) {
          shiftAssignments[empCode][dateStr] = formatShiftTime(startTime, endTime);
        }
      });
    });
  });

  const leavesSnapshot = await getDocs(collection(db, 'leaves'));
  const leaveMap: Record<string, Record<string, string>> = {};

  leavesSnapshot.forEach((doc) => {
    const data = doc.data();
    const type = data.type ?? '';
    const reason = data.reason ?? '';
    const empCode = (data.employeeCode ?? '').toString().trim().toLowerCase();
    if (!empCode) return;

    const dates: string[] = data.dates ?? [];
    const from = data.fromDate;
    const to = data.toDate;

    const leaveDates = new Set<string>();
    if (dates.length > 0) {
      dates.forEach((d) => leaveDates.add(d));
    } else if (from && to) {
      const leaveStart = new Date(from + 'T00:00:00Z');
      const leaveEnd = new Date(to + 'T00:00:00Z');
      for (let d = new Date(leaveStart); d <= leaveEnd; d.setDate(d.getDate() + 1)) {
        leaveDates.add(d.toISOString().split('T')[0]);
      }
    }

    if (!leaveMap[empCode]) leaveMap[empCode] = {};
    const code = getLeaveCode(type, reason);
    leaveDates.forEach((dateStr) => {
      if (dateStr >= fromDate && dateStr <= exportToDate) {
        leaveMap[empCode][dateStr] = code;
      }
    });
  });

  const employees: ShiftMatrixEmployee[] = Object.entries(employeeMap)
    .filter(([code, info]) => {
      const hasShift = Object.keys(shiftAssignments[code] ?? {}).length > 0;
      const hasLeave = Object.keys(leaveMap[code] ?? {}).length > 0;
      const hasRecords = info.recordCodes.some((recordCode) => codesWithRecords.has(recordCode));
      const isInactive = info.employmentStatus.toString().trim().toLowerCase() === 'inactive';
      return (hasShift || hasLeave) && (!isInactive || hasRecords);
    })
    .map(([code, info]) => ({
      code: code.toUpperCase(),
      name: info.name,
      designation: info.designation,
      department: info.department,
      values: dateRange.map((dateStr) => {
        const leaveValue = leaveMap[code]?.[dateStr];
        if (leaveValue) return leaveValue;
        return shiftAssignments[code]?.[dateStr] ?? '';
      }),
    }));

  employees.sort((a, b) => a.name.localeCompare(b.name));

  const dateLabels = dateRange.map((dateStr) => {
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = d.toLocaleDateString('en-GB', { month: 'short' });
    const year = String(d.getFullYear()).slice(-2);
    return `${day}-${month}-${year}`;
  });

  return {
    dayNames: dateRange.map((dateStr) => dayNames[new Date(dateStr).getDay()]),
    dates: dateRange,
    dateLabels,
    employees,
  };
};

export const exportShiftReport = async (fromDate: string, exportToDate: string, location = ''): Promise<void> => {
  const reportData = await getShiftReportData(fromDate, exportToDate, location);
  if (!reportData) return;

  try {
    const { dayNames, dateLabels, employees } = reportData;
    const colCount = 4 + dateLabels.length;
    const endCol = worksheetColumnLetter(colCount);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Shift Report');

    const headerFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE7F3FF' } };
    const dayFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF0F8FF' } };
    const dateFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE8F0F8' } };
    const titleFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF0F4F8' } };
    const rangeFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE8F0F8' } };
    const thinBorder = { style: 'thin' as const, color: { argb: 'FFCCCCCC' } };

    let currentRow = 1;

    // Title section
    worksheet.mergeCells(`A${currentRow}:${endCol}${currentRow}`);
    const locationCell = worksheet.getCell(`A${currentRow}`);
    locationCell.value = location ? location.toUpperCase() : 'ALL LOCATIONS';
    locationCell.font = { bold: true, size: 14, color: { argb: 'FF333333' } };
    locationCell.fill = titleFill;
    locationCell.alignment = { horizontal: 'center', vertical: 'middle' };
    currentRow++;

    worksheet.mergeCells(`A${currentRow}:${endCol}${currentRow}`);
    const titleCell = worksheet.getCell(`A${currentRow}`);
    titleCell.value = 'SHIFT ASSIGNMENT REPORT';
    titleCell.font = { bold: true, size: 16, color: { argb: 'FF333333' } };
    titleCell.fill = titleFill;
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    currentRow++;

    worksheet.mergeCells(`A${currentRow}:${endCol}${currentRow}`);
    const dateRangeCell = worksheet.getCell(`A${currentRow}`);
    dateRangeCell.value = `${fromDate.toUpperCase()} TO ${exportToDate.toUpperCase()}`;
    dateRangeCell.font = { bold: true, size: 12, color: { argb: 'FF333333' } };
    dateRangeCell.fill = rangeFill;
    dateRangeCell.alignment = { horizontal: 'center', vertical: 'middle' };
    currentRow++;

    // Empty row
    currentRow++;

    // Header row 1: day names
    const dayRow = worksheet.getRow(currentRow);
    ['Emp Code', 'Name', 'Designation', 'Dept'].forEach((header, index) => {
      const cell = dayRow.getCell(index + 1);
      cell.value = header;
      cell.font = { bold: true, size: 10, color: { argb: 'FF333333' } };
      cell.fill = headerFill;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
    });
    dayNames.forEach((day, index) => {
      const cell = dayRow.getCell(index + 5);
      cell.value = day;
      cell.font = { bold: true, size: 10, color: { argb: 'FF333333' } };
      cell.fill = dayFill;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
    });
    currentRow++;

    // Header row 2: dates
    const dateRow = worksheet.getRow(currentRow);
    ['Emp Code', 'Name', 'Designation', 'Dept'].forEach((header, index) => {
      const cell = dateRow.getCell(index + 1);
      cell.value = header;
      cell.font = { bold: true, size: 10, color: { argb: 'FF333333' } };
      cell.fill = headerFill;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
    });
    dateLabels.forEach((label, index) => {
      const cell = dateRow.getCell(index + 5);
      cell.value = label;
      cell.font = { bold: true, size: 10, color: { argb: 'FF333333' } };
      cell.fill = dateFill;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
    });
    currentRow++;

    // Data rows
    employees.forEach((emp) => {
      const row = worksheet.getRow(currentRow);
      const values = [emp.code, emp.name, emp.designation, emp.department, ...emp.values];
      values.forEach((value, index) => {
        const cell = row.getCell(index + 1);
        cell.value = value;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
      });
      currentRow++;
    });

    // Column widths
    worksheet.getColumn(1).width = 12;
    worksheet.getColumn(2).width = 25;
    worksheet.getColumn(3).width = 18;
    worksheet.getColumn(4).width = 18;
    for (let i = 5; i <= colCount; i++) {
      worksheet.getColumn(i).width = 14;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `shift_report_${fromDate}_to_${exportToDate}.xlsx`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error('Error exporting shift report:', error);
  }
};

export interface EmployeeMasterRecord {
  employeeCode: string;
  employeeCodeInDevice: string;
  employeeId: string;
  employeeName: string;
  officialEmail: string;
  username: string;
  loginId: string;
  dateOfJoining: string;
  employmentType: string;
  designation: string;
  subDesignation: string;
  department: string;
  grade: string;
  group: string;
  reportingManager: string;
  workLocation: string;
  probationPeriod: string;
  confirmationDate: string;
  employmentStatus: string;
}

export interface EmployeeMasterData {
  locationLabel: string;
  employees: EmployeeMasterRecord[];
}

export const getEmployeeMasterData = async (location = '', status = 'Active'): Promise<EmployeeMasterData | null> => {
  const employeesSnapshot = await getDocs(collection(db, 'employees'));
  const employees: any[] = [];

  employeesSnapshot.forEach((doc) => {
    const data = doc.data();
    if (location && data.workLocation !== location) return;
    employees.push({ id: doc.id, ...data });
  });

  const statusLower = status.toLowerCase();
  const records: EmployeeMasterRecord[] = employees
    .filter((employee) => {
      const deviceCode = (employee.employeeCodeInDevice ?? '').toString().trim();
      if (deviceCode.toLowerCase().startsWith('del')) return false;
      const employmentStatus = (employee.employmentStatus ?? '').toString().trim().toLowerCase();
      if (statusLower === 'all') return true;
      if (statusLower === 'inactive') return employmentStatus === 'inactive';
      return employmentStatus !== 'inactive';
    })
    .map((employee) => ({
      employeeCode: (employee.employeeCode ?? '').toString().toUpperCase(),
      employeeCodeInDevice: (employee.employeeCodeInDevice ?? '').toString().toUpperCase(),
      employeeId: (employee.employeeId ?? '').toString().toUpperCase(),
      employeeName: (employee.employeeName ?? '').toString().toUpperCase(),
      officialEmail: (employee.officialEmail ?? '').toString(),
      username: (employee.username ?? '').toString(),
      loginId: (employee.loginId ?? '').toString(),
      dateOfJoining: (employee.dateOfJoining ?? '').toString(),
      employmentType: (employee.employmentType ?? '').toString().toUpperCase(),
      designation: (employee.designation ?? '').toString().toUpperCase(),
      subDesignation: (employee.subDesignation ?? '').toString().toUpperCase(),
      department: (employee.department ?? '').toString().toUpperCase(),
      grade: (employee.grade ?? '').toString().toUpperCase(),
      group: (employee.group ?? '').toString().toUpperCase(),
      reportingManager: (employee.reportingManager ?? '').toString().toUpperCase(),
      workLocation: (employee.workLocation ?? '').toString().toUpperCase(),
      probationPeriod: (employee.probationPeriod ?? '').toString().toUpperCase(),
      confirmationDate: (employee.confirmationDate ?? '').toString(),
      employmentStatus: (employee.employmentStatus ?? '').toString().toUpperCase(),
    }))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  const locationLabel = location ? location.toUpperCase() : 'ALL LOCATIONS';

  return { locationLabel, employees: records };
};

export const exportEmployeeMaster = async (location = '', status = 'Active'): Promise<void> => {
  const reportData = await getEmployeeMasterData(location, status);
  if (!reportData) return;

  const { locationLabel, employees } = reportData;

  try {
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
    ];

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Employee Master');

    const headerFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE7F3FF' } };
    const titleFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF0F4F8' } };
    const thinBorder = { style: 'thin' as const, color: { argb: 'FFCCCCCC' } };

    const colCount = headers.length;
    const endCol = worksheetColumnLetter(colCount);

    let currentRow = 1;

    worksheet.mergeCells(`A${currentRow}:${endCol}${currentRow}`);
    const locationCell = worksheet.getCell(`A${currentRow}`);
    locationCell.value = locationLabel;
    locationCell.font = { bold: true, size: 14, color: { argb: 'FF333333' } };
    locationCell.fill = titleFill;
    locationCell.alignment = { horizontal: 'center', vertical: 'middle' };
    currentRow++;

    worksheet.mergeCells(`A${currentRow}:${endCol}${currentRow}`);
    const titleCell = worksheet.getCell(`A${currentRow}`);
    titleCell.value = 'EMPLOYEE MASTER';
    titleCell.font = { bold: true, size: 16, color: { argb: 'FF333333' } };
    titleCell.fill = titleFill;
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    currentRow++;

    currentRow++;

    const headerRow = worksheet.getRow(currentRow);
    headers.forEach((header, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = header;
      cell.font = { bold: true, size: 10, color: { argb: 'FF333333' } };
      cell.fill = headerFill;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
    });
    currentRow++;

    employees.forEach((emp) => {
      const row = worksheet.getRow(currentRow);
      const values = [
        emp.employeeCode,
        emp.employeeCodeInDevice,
        emp.employeeId,
        emp.employeeName,
        emp.officialEmail,
        emp.username,
        emp.loginId,
        emp.dateOfJoining,
        emp.employmentType,
        emp.designation,
        emp.subDesignation,
        emp.department,
        emp.grade,
        emp.group,
        emp.reportingManager,
        emp.workLocation,
        emp.probationPeriod,
        emp.confirmationDate,
        emp.employmentStatus,
      ];
      values.forEach((value, index) => {
        const cell = row.getCell(index + 1);
        cell.value = value;
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
        cell.border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
      });
      currentRow++;
    });

    worksheet.getColumn(1).width = 15;
    worksheet.getColumn(2).width = 15;
    worksheet.getColumn(3).width = 15;
    worksheet.getColumn(4).width = 30;
    worksheet.getColumn(5).width = 30;
    worksheet.getColumn(6).width = 18;
    worksheet.getColumn(7).width = 18;
    worksheet.getColumn(8).width = 15;
    worksheet.getColumn(9).width = 18;
    worksheet.getColumn(10).width = 20;
    worksheet.getColumn(11).width = 20;
    worksheet.getColumn(12).width = 20;
    worksheet.getColumn(13).width = 12;
    worksheet.getColumn(14).width = 12;
    worksheet.getColumn(15).width = 25;
    worksheet.getColumn(16).width = 20;
    worksheet.getColumn(17).width = 18;
    worksheet.getColumn(18).width = 18;
    worksheet.getColumn(19).width = 18;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    const timestamp = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `employee_master_${locationLabel.replace(/\s+/g, '_').toLowerCase()}_${timestamp}.xlsx`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error('Error exporting employee master:', error);
  }
};
