import ExcelJS from 'exceljs';

/**
 * Protects against CSV / Excel formula injection.
 * If a string begins with =, +, -, @, \t, or \r, prepend a single quote.
 */
export function protectFormula(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (/^[=+\-@\t\r]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

export interface ExportColumn {
  header: string;
  key: string;
  width?: number;
}

/**
 * Export rows to CSV Buffer with UTF-8 BOM and CRLF line endings.
 */
export function exportToCSV(
  rows: Record<string, any>[],
  columns?: ExportColumn[],
): Buffer {
  const keys = columns && columns.length > 0
    ? columns.map((c) => c.key)
    : rows.length > 0
    ? Object.keys(rows[0])
    : [];

  const headers = columns && columns.length > 0
    ? columns.map((c) => c.header)
    : keys;

  const escapeCsv = (val: unknown): string => {
    const safeVal = protectFormula(val);
    const str = safeVal === null || safeVal === undefined ? '' : String(safeVal);
    if (/[",\r\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerLine = headers.map(escapeCsv).join(',');
  const rowLines = rows.map((row) =>
    keys.map((k) => escapeCsv(row[k])).join(','),
  );

  const csvContent = '\uFEFF' + [headerLine, ...rowLines].join('\r\n');
  return Buffer.from(csvContent, 'utf-8');
}

/**
 * Export rows to Excel XLSX Buffer with formatted headers and widths.
 */
export async function exportToXLSX(
  rows: Record<string, any>[],
  columns?: ExportColumn[],
  sheetName = 'Report',
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'LI CRM';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(sheetName);

  const colDefinitions: ExportColumn[] = columns && columns.length > 0
    ? columns
    : rows.length > 0
    ? Object.keys(rows[0]).map((k) => ({
        header: k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' '),
        key: k,
      }))
    : [{ header: 'Data', key: 'data' }];

  worksheet.columns = colDefinitions.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width || Math.max(c.header.length + 4, 15),
  }));

  // Style header row
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F497D' }, // Professional dark navy
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 24;

  // Add data rows with formula protection
  for (const row of rows) {
    const safeRow: Record<string, any> = {};
    for (const c of colDefinitions) {
      safeRow[c.key] = protectFormula(row[c.key]);
    }
    worksheet.addRow(safeRow);
  }

  // Auto-fit columns slightly based on max content length
  worksheet.columns.forEach((column) => {
    let maxLen = column.header ? String(column.header).length : 10;
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = cell.value ? String(cell.value).length : 0;
      if (len > maxLen) maxLen = len;
    });
    column.width = Math.min(Math.max(maxLen + 4, 12), 50);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

