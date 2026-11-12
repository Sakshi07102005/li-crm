import { Request, Response } from 'express';
import { AuthUser } from '../types/express';
import { sendSuccess } from '../utils/response';
import { AppError } from '../utils/AppError';
import * as reportService from '../services/report.service';

/**
 * Helper to handle file export or JSON response for reports.
 */
async function handleReportResponse(
  req: Request,
  res: Response,
  reportName: string,
  fetchFn: (user: AuthUser, filter: reportService.ReportFilter) => Promise<{ rows: any[]; columns: any[] }>,
) {
  const user = req.user!;
  const format = (req.query.format as string)?.toLowerCase() || 'json';
  const filter: reportService.ReportFilter = {
    fromDate: req.query.fromDate as string,
    toDate: req.query.toDate as string,
    productId: req.query.productId ? Number(req.query.productId) : undefined,
    sourceId: req.query.sourceId ? Number(req.query.sourceId) : undefined,
    format: format as any,
  };

  if (format === 'csv' || format === 'xlsx') {
    if (!user.permissions.includes('reports.export')) {
      throw AppError.forbidden('Permission reports.export required for file exports');
    }

    const { rows, columns } = await fetchFn(user, filter);

    if (format === 'csv') {
      const buffer = reportService.exportToCSV(rows, columns);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${reportName}.csv"`);
      return res.status(200).send(buffer);
    } else {
      const buffer = await reportService.exportToXLSX(rows, columns, reportName);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', `attachment; filename="${reportName}.xlsx"`);
      return res.status(200).send(buffer);
    }
  }

  const { rows } = await fetchFn(user, filter);
  return sendSuccess(res, rows);
}

export async function getDashboard(req: Request, res: Response): Promise<Response> {
  const data = await reportService.getDashboardData(req.user!);
  return sendSuccess(res, data);
}

export async function getLeadsByStatus(req: Request, res: Response) {
  return handleReportResponse(req, res, 'leads_by_status', reportService.getLeadsByStatusReport);
}

export async function getLeadsBySource(req: Request, res: Response) {
  return handleReportResponse(req, res, 'leads_by_source', reportService.getLeadsBySourceReport);
}

export async function getLeadsByProduct(req: Request, res: Response) {
  return handleReportResponse(req, res, 'leads_by_product', reportService.getLeadsByProductReport);
}

export async function getTeamPerformance(req: Request, res: Response) {
  return handleReportResponse(req, res, 'team_performance', reportService.getTeamPerformanceReport);
}

export async function getConversionRates(req: Request, res: Response) {
  return handleReportResponse(req, res, 'conversion_rates', reportService.getConversionRatesReport);
}

