import { Request, Response } from 'express';
import { sendSuccess } from '../utils/response';
import { AppError } from '../utils/AppError';
import * as importService from '../services/import.service';

export async function getTemplate(_req: Request, res: Response) {
  const buffer = await importService.generateLeadImportTemplate();
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="lead_import_template.xlsx"',
  );
  return res.status(200).send(buffer);
}

export async function importLeads(req: Request, res: Response) {
  if (!req.file) {
    throw AppError.validationError('A CSV or XLSX file is required');
  }

  const user = req.user!;
  const ip = req.ip || null;
  const ua = (req.headers['user-agent'] as string) || null;

  const result = await importService.processLeadImport(
    user,
    req.file.buffer,
    req.file.originalname || 'upload.xlsx',
    ip,
    ua,
  );

  return sendSuccess(res, result, 'Lead import completed');
}

