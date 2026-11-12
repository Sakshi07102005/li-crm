import { Request, Response } from 'express';
import { sendSuccess } from '../utils/response';
import * as auditService from '../services/auditViewer.service';

export async function listAuditLogs(req: Request, res: Response) {
  const user = req.user!;
  const filter: auditService.ListAuditLogsQuery = {
    page: req.query.page ? Number(req.query.page) : 1,
    limit: req.query.limit ? Number(req.query.limit) : 20,
    action: req.query.action as string,
    entityType: req.query.entityType as string,
    entityId: req.query.entityId as string,
    userId: req.query.userId as string,
    fromDate: req.query.fromDate as string,
    toDate: req.query.toDate as string,
  };

  const data = await auditService.listAuditLogs(user, filter);
  return sendSuccess(res, data);
}

