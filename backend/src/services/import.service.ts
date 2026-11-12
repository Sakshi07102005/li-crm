import ExcelJS from 'exceljs';
import { AuthUser } from '../types/express';
import { query, withTransaction } from '../db/pool';
import { AppError } from '../utils/AppError';
import { writeAuditLog } from './audit.service';
import {
  normalizeEmail,
  isValidEmail,
  normalizeMobile,
  normalizeWebsite,
} from '../utils/leadNormalizers';
import { checkDuplicate } from './lead.service';

export interface ImportError {
  row: number;
  reason: string;
  data?: Record<string, any>;
}

export interface ImportResult {
  totalRows: number;
  importedCount: number;
  failedCount: number;
  skippedCount: number;
  errors: ImportError[];
}

const MAX_IMPORT_ROWS = 1000;

/**
 * Generate an Excel XLSX template for bulk lead import.
 */
export async function generateLeadImportTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Leads Template');

  worksheet.columns = [
    { header: 'Lead Name *', key: 'leadName', width: 25 },
    { header: 'Email', key: 'email', width: 25 },
    { header: 'Mobile', key: 'mobile', width: 18 },
    { header: 'Product Code *', key: 'productCode', width: 22 },
    { header: 'Source Name *', key: 'sourceName', width: 20 },
    { header: 'Priority', key: 'priority', width: 14 },
    { header: 'Company Name', key: 'companyName', width: 25 },
    { header: 'Assigned To Email', key: 'assignedToEmail', width: 26 },
    { header: 'Remarks', key: 'remarks', width: 30 },
  ];

  // Style header row
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F497D' },
  };
  headerRow.height = 24;

  // Add sample row
  worksheet.addRow({
    leadName: 'Jane Doe',
    email: 'jane.doe@example.com',
    mobile: '+919876543210',
    productCode: 'LEARNPROFESSIONAL',
    sourceName: 'Website',
    priority: 'high',
    companyName: 'Acme Corp',
    assignedToEmail: 'sales1@licrm.example',
    remarks: 'Interested in annual subscription',
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Parses raw buffer (CSV or XLSX) into an array of row objects.
 */
async function parseRowsFromBuffer(
  buffer: Buffer,
  filenameOrMime: string,
): Promise<Array<Record<string, any>>> {
  const workbook = new ExcelJS.Workbook();
  const lower = filenameOrMime.toLowerCase();

  if (lower.endsWith('.csv') || lower.includes('csv')) {
    const stream = require('stream');
    const bufferStream = new stream.PassThrough();
    bufferStream.end(buffer);
    await workbook.csv.read(bufferStream);
  } else {
    await workbook.xlsx.load(buffer as any);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const rows: Array<Record<string, any>> = [];
  const headerMap: Record<number, string> = {};

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell((cell, colNumber) => {
        const val = String(cell.value || '')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '');
        headerMap[colNumber] = val;
      });
    } else {
      const rowData: Record<string, any> = {};
      let hasData = false;
      row.eachCell((cell, colNumber) => {
        const key = headerMap[colNumber];
        if (key) {
          let cellValue = cell.value;
          if (cellValue && typeof cellValue === 'object') {
            if ('text' in cellValue) cellValue = (cellValue as any).text;
            else if ('result' in cellValue) cellValue = (cellValue as any).result;
          }
          rowData[key] = cellValue !== undefined && cellValue !== null ? String(cellValue).trim() : '';
          if (rowData[key]) hasData = true;
        }
      });
      if (hasData) {
        rows.push(rowData);
      }
    }
  });

  return rows;
}

/**
 * Normalizes headers from various naming variants to standard fields.
 */
function extractRowFields(row: Record<string, any>): {
  leadName: string;
  email: string | null;
  mobile: string | null;
  productKey: string;
  sourceKey: string;
  priority: 'high' | 'medium' | 'low';
  companyName: string | null;
  assignedToEmail: string | null;
  remarks: string | null;
} {
  const leadName = row['leadname'] || row['name'] || row['fullname'] || '';
  const email = row['email'] || row['emailaddress'] || null;
  const mobile = row['mobile'] || row['phone'] || row['phonenumber'] || null;
  const productKey = row['productcode'] || row['product'] || row['productname'] || '';
  const sourceKey = row['sourcename'] || row['source'] || '';
  const rawPriority = (row['priority'] || 'medium').toLowerCase();
  const priority = rawPriority === 'high' || rawPriority === 'low' ? rawPriority : 'medium';
  const companyName = row['companyname'] || row['company'] || null;
  const assignedToEmail = row['assignedtoemail'] || row['assignedto'] || row['assignee'] || null;
  const remarks = row['remarks'] || row['notes'] || null;

  return {
    leadName,
    email,
    mobile,
    productKey,
    sourceKey,
    priority,
    companyName,
    assignedToEmail,
    remarks,
  };
}

/**
 * Process bulk lead import file.
 */
export async function processLeadImport(
  user: AuthUser,
  fileBuffer: Buffer,
  filenameOrMime: string,
  ip: string | null,
  ua: string | null,
): Promise<ImportResult> {
  const rawRows = await parseRowsFromBuffer(fileBuffer, filenameOrMime);

  if (rawRows.length === 0) {
    throw AppError.validationError('Import file is empty or contains no data rows');
  }

  if (rawRows.length > MAX_IMPORT_ROWS) {
    throw AppError.validationError(
      `Import file exceeds the maximum limit of ${MAX_IMPORT_ROWS} rows (found ${rawRows.length})`,
    );
  }

  // Pre-load reference lookups
  const [productsRes, sourcesRes, usersRes, statusRes] = await Promise.all([
    query<{ id: number; code: string; name: string }>(`SELECT id, code, name FROM products`),
    query<{ id: number; name: string }>(`SELECT id, name FROM lead_sources`),
    query<{ id: string; email: string }>(`SELECT id, email FROM users WHERE is_active = TRUE`),
    query<{ id: number }>(`SELECT id FROM lead_statuses WHERE name = 'New Lead'`),
  ]);

  const productByCode = new Map<string, number>();
  for (const p of productsRes.rows) {
    productByCode.set(p.code.toLowerCase(), p.id);
    productByCode.set(p.name.toLowerCase(), p.id);
  }

  const sourceByName = new Map<string, number>();
  for (const s of sourcesRes.rows) {
    sourceByName.set(s.name.toLowerCase(), s.id);
  }

  const userByEmail = new Map<string, string>();
  for (const u of usersRes.rows) {
    userByEmail.set(u.email.toLowerCase(), u.id);
  }

  const defaultProductId = productsRes.rows[0]?.id;
  const defaultSourceId = sourcesRes.rows[0]?.id;
  const newLeadStatusId = statusRes.rows[0]?.id;

  let importedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  const errors: ImportError[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const rowNum = i + 2; // Row number in sheet (1-based, +1 for header)
    const raw = rawRows[i];
    const fields = extractRowFields(raw);

    // 1. Validate required name
    if (!fields.leadName) {
      failedCount++;
      errors.push({ row: rowNum, reason: 'Lead name is required' });
      continue;
    }

    // 2. Validate contact details (at least one required)
    if (!fields.email && !fields.mobile) {
      failedCount++;
      errors.push({ row: rowNum, reason: 'Either email or mobile is required' });
      continue;
    }

    const normEmail = fields.email ? normalizeEmail(fields.email) : null;
    const normMobile = fields.mobile ? normalizeMobile(fields.mobile) : null;

    if (fields.email && (!normEmail || !isValidEmail(normEmail))) {
      failedCount++;
      errors.push({ row: rowNum, reason: 'Invalid email address format' });
      continue;
    }

    // 3. Resolve Product
    let productId = fields.productKey ? productByCode.get(fields.productKey.toLowerCase()) : undefined;
    if (!productId) {
      productId = defaultProductId;
    }

    // 4. Resolve Source
    let sourceId = fields.sourceKey ? sourceByName.get(fields.sourceKey.toLowerCase()) : undefined;
    if (!sourceId) {
      sourceId = defaultSourceId;
    }

    // 5. Resolve Assignment
    let assignedTo: string | null = null;
    if (fields.assignedToEmail) {
      assignedTo = userByEmail.get(fields.assignedToEmail.toLowerCase()) || null;
    }
    if (!assignedTo && user.permissions.includes('leads.view_own')) {
      assignedTo = user.id;
    }

    // 6. Duplicate check
    try {
      const dupCheck = await checkDuplicate(user, {
        email: normEmail ?? undefined,
        mobile: normMobile ?? undefined,
      });

      if (dupCheck.duplicates.length > 0 || dupCheck.outOfScopeCount > 0) {
        skippedCount++;
        errors.push({ row: rowNum, reason: 'Duplicate lead skipped' });
        continue;
      }
    } catch {
      // If duplicate check throws, skip to be safe
    }

    // 7. Insert lead
    try {
      await withTransaction(async (client) => {
        const ins = await client.query<{ id: string; lead_code: string }>(
          `INSERT INTO leads (
            lead_name, company_name, email, mobile, product_id, source_id,
            assigned_to, priority, status_id, remarks, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id, lead_code`,
          [
            fields.leadName.trim(),
            fields.companyName?.trim() ?? null,
            normEmail,
            normMobile,
            productId,
            sourceId,
            assignedTo,
            fields.priority,
            newLeadStatusId,
            fields.remarks?.trim() ?? null,
            user.id,
          ],
        );

        const newLeadId = ins.rows[0].id;

        if (assignedTo) {
          await client.query(
            `INSERT INTO lead_assignments (lead_id, assigned_from, assigned_to, assigned_by, reason)
             VALUES ($1, NULL, $2, $3, 'Bulk import')`,
            [newLeadId, assignedTo, user.id],
          );
        }

        await client.query(
          `INSERT INTO activities (lead_id, user_id, type, subject)
           VALUES ($1, $2, 'note', 'Lead created via bulk import')`,
          [newLeadId, user.id],
        );
      });

      importedCount++;
    } catch (err: any) {
      failedCount++;
      errors.push({ row: rowNum, reason: err.message || 'Database insert failed' });
    }
  }

  // Audit log summary
  await writeAuditLog({
    userId: user.id,
    action: 'lead.import',
    entityType: 'lead',
    newValues: {
      totalRows: rawRows.length,
      importedCount,
      failedCount,
      skippedCount,
    },
    ip,
    userAgent: ua,
  });

  return {
    totalRows: rawRows.length,
    importedCount,
    failedCount,
    skippedCount,
    errors,
  };
}

