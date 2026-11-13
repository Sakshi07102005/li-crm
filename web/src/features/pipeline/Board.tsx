// src/features/pipeline/Board.tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/shared/api/client';
import { Link } from 'react-router-dom';
import { 
  Building2, 
  ArrowRight, 
  X
} from 'lucide-react';

interface Lead {
  id: string;
  leadCode: string;
  leadName: string;
  companyName: string | null;
  email: string | null;
  mobile: string | null;
  priority: 'low' | 'medium' | 'high';
  statusId: number;
  statusName: string;
  productName?: string;
  assignedToName?: string;
  assignedTo?: { id: string; name: string } | null;
}

export default function Board() {
  const queryClient = useQueryClient();
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isMoveOpen, setIsMoveOpen] = useState(false);
  const [targetStatusId, setTargetStatusId] = useState<number>(1);
  const [lostReason, setLostReason] = useState('');
  const [moveError, setMoveError] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  // 1. Fetch leads
  const { data: leadsData, isLoading: leadsLoading } = useQuery({
    queryKey: ['leads'],
    queryFn: async () => {
      const res = await api.get('/leads');
      return res.data.data ?? res.data;
    },
  });

  // 2. Fetch lookups for stages
  const { data: lookupsData } = useQuery({
    queryKey: ['lead-lookups'],
    queryFn: async () => {
      const res = await api.get('/leads/lookups');
      return res.data.data ?? res.data;
    },
  });

  const statuses = lookupsData?.statuses ?? [
    { id: 1, name: 'New Lead' },
    { id: 2, name: 'Contacted' },
    { id: 3, name: 'Interested' },
    { id: 4, name: 'Meeting Scheduled' },
    { id: 5, name: 'Proposal Sent' },
    { id: 6, name: 'Negotiation' },
    { id: 7, name: 'Converted' },
    { id: 8, name: 'Lost' },
  ];

  const leads: Lead[] = leadsData?.leads ?? (Array.isArray(leadsData) ? leadsData : []);

  // Status transition mutation
  const statusMutation = useMutation({
    mutationFn: async ({ leadId, statusId, reason }: { leadId: string; statusId: number; reason?: string }) => {
      const res = await api.patch(`/leads/${leadId}/status`, {
        statusId,
        lostReason: statusId === 8 ? reason : undefined,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setIsMoveOpen(false);
      setSelectedLead(null);
      setLostReason('');
      setMoveError(null);
    },
    onError: (err: any) => {
      setMoveError(err.response?.data?.message || 'Failed to update pipeline stage');
    },
  });

  const openMoveModal = (lead: Lead, nextStatusId?: number) => {
    setSelectedLead(lead);
    const currId = typeof lead.statusId === 'number' ? lead.statusId : 1;
    setTargetStatusId(nextStatusId ?? (currId < 7 ? currId + 1 : currId));
    setMoveError(null);
    setIsMoveOpen(true);
  };

  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'text-rose-600 bg-rose-50 border-rose-200';
      case 'low':
        return 'text-slate-500 bg-slate-50 border-slate-200';
      default:
        return 'text-blue-600 bg-blue-50 border-blue-200';
    }
  };

  const getStageColor = (statusName: string) => {
    const s = statusName.toLowerCase();
    if (s.includes('new')) return 'border-t-blue-500';
    if (s.includes('contact')) return 'border-t-sky-500';
    if (s.includes('interest')) return 'border-t-indigo-500';
    if (s.includes('meeting')) return 'border-t-purple-500';
    if (s.includes('proposal')) return 'border-t-amber-500';
    if (s.includes('negot')) return 'border-t-orange-500';
    if (s.includes('convert')) return 'border-t-emerald-500';
    if (s.includes('lost')) return 'border-t-rose-500';
    return 'border-t-slate-500';
  };

  const filteredLeads = leads.filter((l) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      l.leadName?.toLowerCase().includes(q) ||
      l.companyName?.toLowerCase().includes(q) ||
      l.email?.toLowerCase().includes(q) ||
      l.leadCode?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Sales Pipeline Board</h1>
            <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200/60 px-2.5 py-0.5 rounded-full">
              Kanban View
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            Visualize customer journey stages and progress deals through the sales funnel
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Filter pipeline leads..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="text-xs bg-white border border-slate-200 rounded-xl px-3.5 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm w-56"
          />
          <Link
            to="/leads"
            className="text-xs font-semibold px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 transition shadow-sm"
          >
            Switch to List
          </Link>
        </div>
      </div>

      {/* Kanban Board Columns Container */}
      {leadsLoading ? (
        <div className="p-12 text-center text-slate-400 animate-pulse text-sm">
          Loading pipeline stages...
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-6 select-none">
          {statuses.map((st: any) => {
            const columnLeads = filteredLeads.filter((l) => {
              const leadStatus =
                typeof (l as any).status === 'object' && (l as any).status !== null
                  ? (l as any).status.id
                  : (l as any).statusId ?? (l as any).status;
              const leadStatusName =
                typeof (l as any).status === 'object' && (l as any).status !== null
                  ? (l as any).status.name
                  : (l as any).statusName ?? (l as any).status;

              return leadStatus === st.id || leadStatusName === st.name;
            });

            return (
              <div
                key={st.id}
                className="w-72 flex-shrink-0 flex flex-col bg-slate-100/70 rounded-2xl p-3 border border-slate-200/80 max-h-[calc(100vh-210px)]"
              >
                {/* Column Header */}
                <div className={`p-3 bg-white rounded-xl shadow-sm border border-slate-200/60 border-t-4 ${getStageColor(st.name)} flex items-center justify-between mb-3`}>
                  <span className="font-bold text-xs text-slate-800 tracking-tight">{st.name}</span>
                  <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    {columnLeads.length}
                  </span>
                </div>

                {/* Cards List in this column */}
                <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                  {columnLeads.length === 0 ? (
                    <div className="py-8 text-center text-[11px] text-slate-400 font-medium border border-dashed border-slate-200 rounded-xl">
                      Empty stage
                    </div>
                  ) : (
                    columnLeads.map((lead: any) => {
                      const displayName = lead.leadName || lead.email || lead.mobile || 'Unnamed Lead';
                      const assigned = typeof lead.assignedTo === 'object' ? lead.assignedTo?.name : lead.assignedTo || 'Unassigned';

                      return (
                        <div
                          key={lead.id}
                          className="p-3.5 bg-white rounded-xl border border-slate-200/80 shadow-sm hover:shadow-md transition space-y-2 text-xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <Link
                              to={`/leads/${lead.id}`}
                              className="font-bold text-slate-900 hover:text-blue-600 line-clamp-1 transition"
                            >
                              {displayName}
                            </Link>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border capitalize flex-shrink-0 ${getPriorityStyle(lead.priority || 'medium')}`}>
                              {lead.priority || 'med'}
                            </span>
                          </div>

                          {lead.companyName && (
                            <div className="flex items-center gap-1.5 text-slate-600">
                              <Building2 size={13} className="text-slate-400 flex-shrink-0" />
                              <span className="truncate">{lead.companyName}</span>
                            </div>
                          )}

                          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                            <span className="truncate max-w-[110px] text-slate-600 font-medium">
                              👤 {assigned}
                            </span>
                            <button
                              onClick={() => openMoveModal(lead)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800"
                            >
                              <span>Move</span>
                              <ArrowRight size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Move Stage Modal */}
      {isMoveOpen && selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
              <h2 className="text-base font-bold text-slate-900">Advance Pipeline Stage</h2>
              <button onClick={() => setIsMoveOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition">
                <X size={18} />
              </button>
            </div>
            {moveError && (
              <div className="p-3 mx-6 mt-4 text-xs bg-rose-50 text-rose-700 border border-rose-200 rounded-xl">
                {moveError}
              </div>
            )}
            <div className="p-6 space-y-4 text-sm">
              <div>
                <span className="text-xs text-slate-400 block uppercase tracking-wider font-semibold">Lead</span>
                <p className="font-bold text-slate-800">{selectedLead.leadName || selectedLead.email}</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Target Stage</label>
                <select
                  value={targetStatusId}
                  onChange={(e) => setTargetStatusId(Number(e.target.value))}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition bg-white text-sm"
                >
                  {statuses.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {targetStatusId === 8 && (
                <div>
                  <label className="block text-xs font-semibold text-rose-600 uppercase tracking-wider mb-1">
                    Lost Reason <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Budget, competitor, timeline..."
                    value={lostReason}
                    onChange={(e) => setLostReason(e.target.value)}
                    className="w-full px-3.5 py-2 border border-rose-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition text-sm"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsMoveOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={statusMutation.isPending}
                  onClick={() => statusMutation.mutate({ leadId: selectedLead.id, statusId: targetStatusId, reason: lostReason })}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-500/20 transition disabled:opacity-50"
                >
                  {statusMutation.isPending ? 'Advancing...' : 'Confirm Stage'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
