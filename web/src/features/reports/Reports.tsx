// src/features/reports/Reports.tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/shared/api/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/ui/Card';
import { 
  Download, 
  Upload, 
  Users, 
  Layers, 
  Compass, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  ArrowDownToLine,
  ShieldCheck
} from 'lucide-react';

interface StatusRow {
  status: string;
  count: number;
  percentage: number;
}

interface SourceRow {
  source: string;
  isMarketing: boolean;
  count: number;
  percentage: number;
}

interface TeamMemberRow {
  userId: string;
  userName: string;
  email: string;
  role: string;
  leadsCreated: number;
  leadsAssigned: number;
  leadsConverted: number;
  followupsCompleted: number;
}

export default function Reports() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'status' | 'source' | 'team' | 'import'>('status');
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<any | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // 1. Leads by status report
  const { data: statusData, isLoading: statusLoading } = useQuery<{ data: StatusRow[] }>({
    queryKey: ['report-status'],
    queryFn: async () => {
      const res = await api.get('/reports/leads-by-status');
      return res.data;
    },
  });

  // 2. Leads by source report
  const { data: sourceData, isLoading: sourceLoading } = useQuery<{ data: SourceRow[] }>({
    queryKey: ['report-source'],
    queryFn: async () => {
      const res = await api.get('/reports/leads-by-source');
      return res.data;
    },
  });

  // 3. Team performance report
  const { data: teamData, isLoading: teamLoading } = useQuery<{ data: TeamMemberRow[] }>({
    queryKey: ['report-team'],
    queryFn: async () => {
      const res = await api.get('/reports/team-performance');
      return res.data;
    },
  });

  // File export helper (CSV / XLSX)
  const handleExport = async (reportType: string, format: 'csv' | 'xlsx') => {
    try {
      setIsExporting(`${reportType}-${format}`);
      const endpoint = `/reports/${reportType}?format=${format}`;
      const response = await api.get(endpoint, {
        responseType: 'blob',
      });

      const blob = new Blob([response.data], {
        type: format === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${reportType}_report.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Export failed. Check reports.export permissions or server logs.');
    } finally {
      setIsExporting(null);
    }
  };

  // Download template helper
  const handleDownloadTemplate = async () => {
    try {
      const res = await api.get('/leads/import/template', { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'leads_import_template.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert('Failed to download import template.');
    }
  };

  // Bulk import mutation
  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/leads/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data ?? res.data;
    },
    onSuccess: (data) => {
      setImportResult(data);
      setImportError(null);
      setImportFile(null);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['report-status'] });
      queryClient.invalidateQueries({ queryKey: ['report-source'] });
    },
    onError: (err: any) => {
      setImportError(err.response?.data?.message || err.response?.data?.error?.message || 'File import failed');
    },
  });

  const statuses = statusData?.data || [];
  const sources = sourceData?.data || [];
  const team = teamData?.data || [];

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Reports & Analytics</h1>
            <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200/60 px-2.5 py-0.5 rounded-full">
              Enterprise BI
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Role-scoped pipeline conversions, acquisition analytics, and secure data export
          </p>
        </div>

        {/* Global Export & Import Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => handleExport('leads-by-status', 'csv')}
            disabled={!!isExporting}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition shadow-sm disabled:opacity-50"
          >
            <Download size={14} className="text-slate-500" />
            <span>{isExporting?.includes('csv') ? 'Exporting...' : 'Export CSV'}</span>
          </button>

          <button
            onClick={() => handleExport('leads-by-status', 'xlsx')}
            disabled={!!isExporting}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200/80 hover:bg-emerald-100 transition shadow-sm disabled:opacity-50"
          >
            <FileSpreadsheet size={14} className="text-emerald-600" />
            <span>{isExporting?.includes('xlsx') ? 'Exporting...' : 'Export Excel (XLSX)'}</span>
          </button>

          <button
            onClick={() => setActiveTab('import')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition"
          >
            <Upload size={14} />
            <span>Bulk Import Leads</span>
          </button>
        </div>
      </div>

      {/* Security CWE-1236 Defense Callout Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white shadow-md flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-500/20 border border-blue-400/30 text-blue-300">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-blue-300">
              CSV Formula Injection Defense Active (CWE-1236)
            </h4>
            <p className="text-xs text-slate-300 mt-0.5">
              All exported files sanitize spreadsheet prefixes (<code className="text-blue-200">=, +, -, @</code>) with single-quote escaping to prevent remote formula execution.
            </p>
          </div>
        </div>
        <span className="hidden md:inline-flex text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2.5 py-1 rounded-full">
          Hardened
        </span>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-200/60 rounded-xl max-w-fit">
        {[
          { id: 'status', label: 'Leads by Status', icon: Layers },
          { id: 'source', label: 'Acquisition Channels', icon: Compass },
          { id: 'team', label: 'Team Performance', icon: Users },
          { id: 'import', label: 'Bulk CSV/XLSX Import', icon: Upload },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: LEADS BY STATUS */}
      {activeTab === 'status' && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-slate-900">Pipeline Stage Distribution</CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">Active distribution and conversion percentage across stages</p>
              </div>
              <button
                onClick={() => handleExport('leads-by-status', 'csv')}
                className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-medium"
              >
                <Download size={13} /> Export Data
              </button>
            </CardHeader>

            <CardContent className="space-y-4 pt-4">
              {statusLoading ? (
                <div className="p-8 text-center text-slate-400 animate-pulse text-sm">Loading status distribution...</div>
              ) : statuses.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm">No status metrics available.</div>
              ) : (
                <div className="space-y-3.5">
                  {statuses.map((row) => (
                    <div key={row.status} className="p-3.5 rounded-xl border border-slate-100 hover:border-slate-200 transition bg-slate-50/50">
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <span className="font-semibold text-slate-800">{row.status}</span>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-slate-900">{row.count} leads</span>
                          <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                            {row.percentage}%
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full bg-blue-600 rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(row.percentage, 3)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 2: LEADS BY SOURCE */}
      {activeTab === 'source' && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-slate-900">Customer Acquisition Sources</CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">Performance breakdown by marketing channel vs referral</p>
              </div>
              <button
                onClick={() => handleExport('leads-by-source', 'csv')}
                className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-medium"
              >
                <Download size={13} /> Export Data
              </button>
            </CardHeader>

            <CardContent className="space-y-3 pt-4">
              {sourceLoading ? (
                <div className="p-8 text-center text-slate-400 animate-pulse text-sm">Loading acquisition sources...</div>
              ) : sources.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm">No source metrics found.</div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {sources.map((s) => (
                    <div key={s.source} className="p-4 rounded-xl border border-slate-200/80 bg-white shadow-sm flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 text-sm">{s.source}</span>
                          {s.isMarketing && (
                            <span className="text-[10px] font-semibold bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200/60">
                              Marketing
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400">Share of pipeline: {s.percentage}%</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xl font-extrabold text-slate-900">{s.count}</span>
                        <span className="text-[11px] text-slate-400 block">leads</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 3: TEAM PERFORMANCE */}
      {activeTab === 'team' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-slate-900">Team Conversion Leaderboard</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">Assigned leads, conversion count, and completed follow-up activities</p>
            </div>
            <button
              onClick={() => handleExport('team-performance', 'csv')}
              className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-medium"
            >
              <Download size={13} /> Export Team Sheet
            </button>
          </CardHeader>

          <CardContent className="pt-2">
            {teamLoading ? (
              <div className="p-8 text-center text-slate-400 animate-pulse text-sm">Loading team performance...</div>
            ) : team.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">No team performance data available.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      <th className="py-3 px-3">Team Member</th>
                      <th className="py-3 px-3">Role</th>
                      <th className="py-3 px-3 text-center">Assigned</th>
                      <th className="py-3 px-3 text-center">Converted</th>
                      <th className="py-3 px-3 text-center">Follow-ups Done</th>
                      <th className="py-3 px-3 text-right">Win Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {team.map((rep) => {
                      const winRate = rep.leadsAssigned > 0 
                        ? Math.round((rep.leadsConverted / rep.leadsAssigned) * 100) 
                        : 0;

                      return (
                        <tr key={rep.userId} className="hover:bg-slate-50/60 transition">
                          <td className="py-3 px-3 font-semibold text-slate-800">
                            <div>
                              <span>{rep.userName}</span>
                              <span className="block text-[11px] font-normal text-slate-400">{rep.email}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                              {rep.role}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center font-bold text-slate-700">{rep.leadsAssigned}</td>
                          <td className="py-3 px-3 text-center font-bold text-emerald-600">{rep.leadsConverted}</td>
                          <td className="py-3 px-3 text-center font-semibold text-blue-600">{rep.followupsCompleted}</td>
                          <td className="py-3 px-3 text-right">
                            <span className="text-xs font-extrabold text-slate-900 bg-slate-100 px-2 py-1 rounded-md">
                              {winRate}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 4: BULK CSV/XLSX IMPORT */}
      {activeTab === 'import' && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Upload Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-bold text-slate-900">Bulk Lead Ingestion</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Upload CSV or Excel (.xlsx) files up to 5MB. Checks for duplicate emails/mobiles.
              </p>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {importError && (
                <div className="p-3 text-xs bg-rose-50 text-rose-700 border border-rose-200 rounded-xl flex items-center gap-2">
                  <AlertCircle size={15} className="flex-shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              {importResult && (
                <div className="p-4 text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    <span>Import Completed Successfully!</span>
                  </div>
                  <p>Total Processed: <strong>{importResult.totalRows ?? importResult.processed ?? 0}</strong></p>
                  <p>Imported: <strong>{importResult.importedRows ?? importResult.imported ?? 0}</strong></p>
                  <p>Skipped / Duplicates: <strong>{importResult.skippedRows ?? importResult.skipped ?? 0}</strong></p>
                </div>
              )}

              {/* Drag/drop file selector area */}
              <div className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-2xl p-6 text-center bg-slate-50/50 transition">
                <input
                  type="file"
                  id="bulkFileInput"
                  accept=".csv,.xlsx"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      setImportFile(e.target.files[0]);
                      setImportError(null);
                    }
                  }}
                />
                <label htmlFor="bulkFileInput" className="cursor-pointer block">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-2 shadow-sm">
                    <Upload size={20} />
                  </div>
                  <p className="text-sm font-bold text-slate-800">
                    {importFile ? importFile.name : 'Select .CSV or .XLSX File'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {importFile ? `${(importFile.size / 1024).toFixed(1)} KB` : 'Click to browse from your device'}
                  </p>
                </label>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
                >
                  <ArrowDownToLine size={14} />
                  <span>Download Sample CSV Template</span>
                </button>

                <button
                  type="button"
                  disabled={!importFile || importMutation.isPending}
                  onClick={() => {
                    if (importFile) importMutation.mutate(importFile);
                  }}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-500/20 transition disabled:opacity-50"
                >
                  {importMutation.isPending ? 'Processing File...' : 'Start Ingestion'}
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Guidelines & Spec Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-bold text-slate-900">Import Specifications</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">Required columns and validation guidelines</p>
            </CardHeader>
            <CardContent className="space-y-3 pt-4 text-xs text-slate-600">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5">
                <span className="font-bold text-slate-800 block">Accepted Columns:</span>
                <p className="font-mono text-[11px] text-blue-700 bg-white p-2 rounded border border-slate-200">
                  leadName, companyName, email, mobile, productName, sourceName, priority, remarks
                </p>
              </div>

              <ul className="space-y-2 list-disc list-inside leading-relaxed text-slate-500">
                <li><strong className="text-slate-700">leadName</strong> is required for every row.</li>
                <li>At least one of <strong className="text-slate-700">email</strong> or <strong className="text-slate-700">mobile</strong> must be supplied.</li>
                <li>Rows with identical email or mobile within 90 days are automatically detected and flagged as duplicate.</li>
                <li>File size limit is enforced at 5 Megabytes.</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
