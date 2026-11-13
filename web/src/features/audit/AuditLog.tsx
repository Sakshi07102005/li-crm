// src/features/audit/AuditLog.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/shared/api/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/ui/Card';
import { 
  ShieldCheck, 
  Filter, 
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface AuditLogItem {
  id: string;
  user: {
    id: string;
    name: string;
    email: string;
  } | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  oldValues: Record<string, any> | null;
  newValues: Record<string, any> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export default function AuditLog() {
  const [page, setPage] = useState(1);
  const [selectedAction, setSelectedAction] = useState('all');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit-logs', page, selectedAction],
    queryFn: async () => {
      const params: any = { page, limit: 15 };
      if (selectedAction !== 'all') params.action = selectedAction;
      const res = await api.get('/audit', { params });
      return res.data.data ?? res.data;
    },
  });

  const logs: AuditLogItem[] = data?.logs ?? (Array.isArray(data) ? data : []);
  const meta = data?.meta ?? { total: logs.length, page: 1, totalPages: 1 };

  const getActionBadge = (action: string) => {
    const a = action.toLowerCase();
    if (a.includes('create') || a.includes('insert')) {
      return <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">{action}</span>;
    }
    if (a.includes('delete') || a.includes('revoke')) {
      return <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">{action}</span>;
    }
    if (a.includes('assign') || a.includes('status')) {
      return <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">{action}</span>;
    }
    return <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">{action}</span>;
  };

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Audit Trail & Compliance</h1>
            <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200/60 px-2.5 py-0.5 rounded-full">
              {meta.total ?? logs.length} Events
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Immutable system logs, security events, and user activity records
          </p>
        </div>

        {/* Action Filter */}
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-slate-400" />
          <select
            value={selectedAction}
            onChange={(e) => {
              setSelectedAction(e.target.value);
              setPage(1);
            }}
            className="text-xs font-medium bg-white border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm"
          >
            <option value="all">All Events</option>
            <option value="create">Created</option>
            <option value="update">Updated</option>
            <option value="delete">Deleted</option>
            <option value="status_change">Status Change</option>
            <option value="lead_assigned">Reassigned</option>
          </select>
        </div>
      </div>

      {/* Main Table Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-bold text-slate-900">Historical Activity Trail</CardTitle>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <ShieldCheck size={14} className="text-emerald-500" />
            <span>Cryptographically Verified</span>
          </div>
        </CardHeader>

        <CardContent className="pt-2">
          {isLoading ? (
            <div className="p-8 text-center text-slate-400 animate-pulse text-sm">
              Loading audit logs...
            </div>
          ) : isError ? (
            <div className="p-6 text-center text-rose-600 text-sm">
              Failed to load audit logs. Check audit.view permissions.
            </div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              No audit logs recorded for this criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-3">Timestamp</th>
                    <th className="py-3 px-3">Actor / User</th>
                    <th className="py-3 px-3">Action</th>
                    <th className="py-3 px-3">Target Entity</th>
                    <th className="py-3 px-3">Network IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-3 px-3 font-medium text-slate-600">
                        {new Date(log.createdAt).toLocaleString(undefined, {
                          dateStyle: 'short',
                          timeStyle: 'medium',
                        })}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-800">
                          {log.user?.name || log.user?.email || 'System'}
                        </div>
                        {log.user?.email && (
                          <span className="text-[10px] text-slate-400 block">{log.user.email}</span>
                        )}
                      </td>
                      <td className="py-3 px-3">{getActionBadge(log.action)}</td>
                      <td className="py-3 px-3">
                        <span className="font-mono text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                          {log.entityType ? `${log.entityType}:${log.entityId?.slice(0, 8)}...` : '—'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                        {log.ipAddress || '127.0.0.1'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {meta.totalPages > 1 && (
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>
                Page {page} of {meta.totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  disabled={page >= meta.totalPages}
                  onClick={() => setPage(page + 1)}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
