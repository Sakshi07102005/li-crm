// src/features/leads/LeadsList.tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/shared/api/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/ui/Card';
import { Link } from 'react-router-dom';
import { 
  Plus, 
  X, 
  Search, 
  Building2, 
  Mail, 
  Phone, 
  User, 
  ArrowRight,
  Filter,
  Sparkles,
  Layers
} from 'lucide-react';

export default function LeadsList() {
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');
  const [duplicateStatus, setDuplicateStatus] = useState<{ isDuplicate: boolean; inScopeCount: number; outOfScopeCount: number } | null>(null);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);

  const checkDuplicates = async () => {
    if (!formData.email.trim() && !formData.mobile.trim()) return;
    try {
      setIsCheckingDuplicate(true);
      const res = await api.post('/leads/check-duplicate', {
        email: formData.email.trim() || undefined,
        mobile: formData.mobile.trim() || undefined,
      });
      const resData = res.data.data ?? res.data;
      setDuplicateStatus({
        isDuplicate: Boolean(resData.isDuplicate),
        inScopeCount: resData.inScopeDuplicates?.length ?? 0,
        outOfScopeCount: resData.outOfScopeCount ?? 0,
      });
    } catch (_) {
      // ignore
    } finally {
      setIsCheckingDuplicate(false);
    }
  };

  const [formData, setFormData] = useState({
    leadName: '',
    companyName: '',
    email: '',
    mobile: '',
    productId: 1,
    sourceId: 1,
    priority: 'medium',
    remarks: '',
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['leads'],
    queryFn: async () => {
      const res = await api.get('/leads');
      return res.data.data ?? res.data;
    },
  });

  const { data: lookupsData } = useQuery({
    queryKey: ['lead-lookups'],
    queryFn: async () => {
      const res = await api.get('/leads/lookups');
      return res.data.data ?? res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: typeof formData) => {
      const res = await api.post('/leads', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setIsAddOpen(false);
      setFormError(null);
      setFormData({
        leadName: '',
        companyName: '',
        email: '',
        mobile: '',
        productId: 1,
        sourceId: 1,
        priority: 'medium',
        remarks: '',
      });
    },
    onError: (err: any) => {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.error?.details?.[0]?.message ||
        'Failed to create lead';
      setFormError(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!formData.leadName.trim()) {
      setFormError('Lead name is required');
      return;
    }
    if (!formData.email.trim() && !formData.mobile.trim()) {
      setFormError('At least one of Email or Mobile is required');
      return;
    }
    createMutation.mutate(formData);
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-slate-200 rounded-lg w-48" />
        <div className="grid gap-5 md:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-44 bg-slate-200 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 rounded-xl bg-rose-50 border border-rose-200 text-rose-700">
        <h3 className="font-semibold text-base">Failed to load leads</h3>
        <p className="text-sm mt-1">Please ensure backend services are active.</p>
      </div>
    );
  }

  const leads = data?.leads ?? (Array.isArray(data) ? data : []);
  const products = lookupsData?.products ?? [
    { id: 1, name: 'LearnProfessional' },
    { id: 2, name: 'BookEHealth' },
    { id: 3, name: 'Logische Innovative' },
  ];
  const sources = lookupsData?.sources ?? [
    { id: 1, name: 'Website Inbound' },
    { id: 2, name: 'LinkedIn' },
    { id: 3, name: 'Referral' },
    { id: 4, name: 'Google Ads' },
  ];

  const filteredLeads = leads.filter((lead: any) => {
    const statusName =
      typeof lead.status === 'object' && lead.status !== null
        ? lead.status.name
        : lead.statusName || lead.status || 'New Lead';

    if (selectedStatusFilter !== 'all' && statusName.toLowerCase() !== selectedStatusFilter.toLowerCase()) {
      return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = lead.leadName?.toLowerCase().includes(q);
      const matchCompany = lead.companyName?.toLowerCase().includes(q);
      const matchEmail = lead.email?.toLowerCase().includes(q);
      const matchCode = lead.leadCode?.toLowerCase().includes(q);
      const matchMobile = lead.mobile?.includes(q);
      return matchName || matchCompany || matchEmail || matchCode || matchMobile;
    }

    return true;
  });

  const getStatusColor = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes('new')) return 'bg-blue-50 text-blue-700 border-blue-200/80';
    if (s.includes('contact')) return 'bg-sky-50 text-sky-700 border-sky-200/80';
    if (s.includes('interest')) return 'bg-indigo-50 text-indigo-700 border-indigo-200/80';
    if (s.includes('meeting')) return 'bg-purple-50 text-purple-700 border-purple-200/80';
    if (s.includes('proposal')) return 'bg-amber-50 text-amber-700 border-amber-200/80';
    if (s.includes('negot')) return 'bg-orange-50 text-orange-700 border-orange-200/80';
    if (s.includes('convert')) return 'bg-emerald-50 text-emerald-700 border-emerald-200/80';
    if (s.includes('lost')) return 'bg-rose-50 text-rose-700 border-rose-200/80';
    return 'bg-slate-50 text-slate-700 border-slate-200/80';
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high':
        return <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200/60">High</span>;
      case 'low':
        return <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200/60">Low</span>;
      default:
        return <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200/60">Med</span>;
    }
  };

  const getLeadAvatarColor = (name: string) => {
    const colors = [
      'from-blue-600 to-indigo-600 text-white',
      'from-purple-600 to-pink-600 text-white',
      'from-emerald-600 to-teal-600 text-white',
      'from-amber-500 to-orange-600 text-white',
      'from-cyan-600 to-blue-600 text-white',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="space-y-6">
      {/* Header & Primary CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Leads Pipeline</h1>
            <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200/60 px-2.5 py-0.5 rounded-full">
              {leads.length} Total
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">Track, qualify, and convert potential customers across pipelines</p>
        </div>

        <button
          onClick={() => setIsAddOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-500/20 transition-all duration-200"
        >
          <Plus size={16} />
          <span>Add New Lead</span>
        </button>
      </div>

      {/* Search & Status Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search size={16} />
          </div>
          <input
            type="text"
            placeholder="Search by name, company, email, phone, code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Filter size={14} />
            <span>Status:</span>
          </div>
          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className="text-xs font-medium bg-white border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm"
          >
            <option value="all">All Statuses ({leads.length})</option>
            <option value="New Lead">New Lead</option>
            <option value="Contacted">Contacted</option>
            <option value="Interested">Interested</option>
            <option value="Meeting Scheduled">Meeting Scheduled</option>
            <option value="Proposal Sent">Proposal Sent</option>
            <option value="Negotiation">Negotiation</option>
            <option value="Converted">Converted</option>
            <option value="Lost">Lost</option>
          </select>
        </div>
      </div>

      {/* Leads Grid */}
      {filteredLeads.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200/80 rounded-2xl shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-3">
            <Sparkles size={24} />
          </div>
          <h3 className="text-sm font-semibold text-slate-800">No leads match your criteria</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Try adjusting your search query or status filter.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filteredLeads.map((lead: any) => {
            const statusName =
              typeof lead.status === 'object' && lead.status !== null
                ? lead.status.name
                : lead.statusName || lead.status || 'New Lead';

            const productName =
              typeof lead.product === 'object' && lead.product !== null
                ? lead.product.name
                : lead.product || '';

            const assignedName =
              typeof lead.assignedTo === 'object' && lead.assignedTo !== null
                ? lead.assignedTo.name
                : lead.assignedTo || 'Unassigned';

            const displayName = lead.leadName || lead.email || lead.mobile || 'Unnamed Lead';

            return (
              <Card
                key={lead.id}
                className="hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200 flex flex-col justify-between"
              >
                <div>
                  <CardHeader className="flex flex-row items-start justify-between pb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${getLeadAvatarColor(displayName)} flex items-center justify-center font-bold text-sm shadow-sm flex-shrink-0`}>
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-base font-bold text-slate-900 leading-snug truncate">
                          {displayName}
                        </CardTitle>
                        {lead.leadCode && (
                          <span className="text-[11px] text-slate-400 font-mono tracking-tight">
                            {lead.leadCode}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${getStatusColor(statusName)}`}>
                        {statusName}
                      </span>
                      {getPriorityBadge(lead.priority || 'medium')}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-2 pt-2 text-xs">
                    {lead.companyName && (
                      <div className="flex items-center gap-2 text-slate-700 font-medium">
                        <Building2 size={14} className="text-slate-400 flex-shrink-0" />
                        <span className="truncate">{lead.companyName}</span>
                      </div>
                    )}

                    {lead.email && (
                      <div className="flex items-center gap-2 text-slate-600">
                        <Mail size={14} className="text-slate-400 flex-shrink-0" />
                        <span className="truncate">{lead.email}</span>
                      </div>
                    )}

                    {lead.mobile && (
                      <div className="flex items-center gap-2 text-slate-600">
                        <Phone size={14} className="text-slate-400 flex-shrink-0" />
                        <span>{lead.mobile}</span>
                      </div>
                    )}

                    {productName && (
                      <div className="flex items-center gap-2 text-slate-500 pt-1">
                        <Layers size={13} className="text-slate-400 flex-shrink-0" />
                        <span className="truncate text-[11px]">{productName}</span>
                      </div>
                    )}
                  </CardContent>
                </div>

                {/* Footer Link to Lead Detail */}
                <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 rounded-b-xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <User size={13} className="text-slate-400" />
                    <span className="truncate max-w-[120px] font-medium text-slate-700">
                      {assignedName}
                    </span>
                  </div>

                  <Link
                    to={`/leads/${lead.id}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 group"
                  >
                    <span>View Profile</span>
                    <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Lead Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-100 text-blue-600">
                  <Plus size={18} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Create New Lead</h2>
                  <p className="text-xs text-slate-500">Capture initial contact, interest, and source</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4 text-sm overflow-y-auto">
              {formError && (
                <div className="p-3 text-xs bg-rose-50 text-rose-700 border border-rose-200 rounded-xl">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Lead Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dr. Ronald Vance"
                    value={formData.leadName}
                    onChange={(e) => setFormData({ ...formData, leadName: e.target.value })}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition text-sm"
                  />
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Company Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Vance Health Solutions"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    placeholder="ronald@vancehealth.com"
                    value={formData.email}
                    onChange={(e) => {
                      setFormData({ ...formData, email: e.target.value });
                      setDuplicateStatus(null);
                    }}
                    onBlur={checkDuplicates}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Mobile Phone
                  </label>
                  <input
                    type="tel"
                    placeholder="+1 555-0199"
                    value={formData.mobile}
                    onChange={(e) => {
                      setFormData({ ...formData, mobile: e.target.value });
                      setDuplicateStatus(null);
                    }}
                    onBlur={checkDuplicates}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition text-sm"
                  />
                </div>
              </div>

              {/* Inline Duplicate Detection Banner */}
              {isCheckingDuplicate && (
                <p className="text-[11px] text-slate-400 italic">Checking duplicate index...</p>
              )}
              {duplicateStatus && duplicateStatus.isDuplicate ? (
                <div className="p-3 text-xs bg-amber-50 text-amber-900 border border-amber-200 rounded-xl space-y-0.5">
                  <div className="font-bold flex items-center gap-1.5">
                    <span>⚠️ Duplicate Match Found</span>
                  </div>
                  <p className="text-[11px] text-amber-800">
                    Matches in your territory: <strong>{duplicateStatus.inScopeCount}</strong> | Out-of-scope duplicates: <strong>{duplicateStatus.outOfScopeCount}</strong>
                  </p>
                </div>
              ) : duplicateStatus && !duplicateStatus.isDuplicate ? (
                <div className="p-2 text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl">
                  ✓ Verified: No matching duplicate leads in database.
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Product Interest
                  </label>
                  <select
                    value={formData.productId}
                    onChange={(e) => setFormData({ ...formData, productId: Number(e.target.value) })}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition bg-white text-sm"
                  >
                    {products.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Acquisition Source
                  </label>
                  <select
                    value={formData.sourceId}
                    onChange={(e) => setFormData({ ...formData, sourceId: Number(e.target.value) })}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition bg-white text-sm"
                  >
                    {sources.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Initial Priority
                </label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition bg-white text-sm"
                >
                  <option value="high">High Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="low">Low Priority</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Notes & Remarks
                </label>
                <textarea
                  rows={2}
                  placeholder="Budget expectations, timeline, special requirements..."
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition text-sm"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-500/20 transition disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
