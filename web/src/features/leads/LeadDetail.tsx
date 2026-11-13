// src/features/leads/LeadDetail.tsx
import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/shared/api/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/ui/Card';
import { 
  Edit2, 
  UserCheck, 
  ArrowRightCircle, 
  X, 
  ArrowLeft,
  Mail,
  Phone,
  Building2,
  Calendar,
  Layers,
  Compass,
  User,
  AlertTriangle,
  FileText,
  CheckCircle2
} from 'lucide-react';

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Edit form state
  const [editForm, setEditForm] = useState({
    leadName: '',
    companyName: '',
    email: '',
    mobile: '',
    priority: 'medium',
    remarks: '',
  });

  // Status state
  const [selectedStatusId, setSelectedStatusId] = useState<number>(1);
  const [lostReason, setLostReason] = useState<string>('');

  // Reassign state
  const [selectedAssignee, setSelectedAssignee] = useState<string>('');
  const [assignReason, setAssignReason] = useState<string>('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['lead', id],
    queryFn: async () => {
      const res = await api.get(`/leads/${id}`);
      return res.data.data ?? res.data;
    },
    enabled: !!id,
  });

  const { data: lookupsData } = useQuery({
    queryKey: ['lead-lookups'],
    queryFn: async () => {
      const res = await api.get('/leads/lookups');
      return res.data.data ?? res.data;
    },
  });

  const lead = data?.lead || data;

  // Edit mutation
  const updateMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.put(`/leads/${id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', id] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setIsEditOpen(false);
      setActionError(null);
    },
    onError: (err: any) => {
      setActionError(err.response?.data?.message || 'Failed to update lead');
    },
  });

  // Status mutation
  const statusMutation = useMutation({
    mutationFn: async (payload: { statusId: number; lostReason?: string }) => {
      const res = await api.patch(`/leads/${id}/status`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', id] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setIsStatusOpen(false);
      setActionError(null);
    },
    onError: (err: any) => {
      setActionError(err.response?.data?.message || 'Failed to change status');
    },
  });

  // Reassign mutation
  const assignMutation = useMutation({
    mutationFn: async (payload: { assignedTo: string; reason?: string }) => {
      const res = await api.patch(`/leads/${id}/assign`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', id] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setIsAssignOpen(false);
      setActionError(null);
    },
    onError: (err: any) => {
      setActionError(err.response?.data?.message || 'Failed to reassign lead');
    },
  });

  const openEditModal = () => {
    setEditForm({
      leadName: lead.leadName || '',
      companyName: lead.companyName || '',
      email: lead.email || '',
      mobile: lead.mobile || '',
      priority: lead.priority || 'medium',
      remarks: lead.remarks || '',
    });
    setActionError(null);
    setIsEditOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse max-w-5xl">
        <div className="h-6 bg-slate-200 rounded w-32" />
        <div className="h-40 bg-slate-200 rounded-2xl" />
        <div className="grid gap-6 md:grid-cols-2">
          <div className="h-64 bg-slate-200 rounded-2xl" />
          <div className="h-64 bg-slate-200 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 max-w-2xl">
        <h3 className="font-semibold text-base">Failed to load lead details</h3>
        <p className="text-sm mt-1">Please ensure the lead exists and your backend is accessible.</p>
        <Link to="/leads" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-rose-800 underline">
          ← Return to leads list
        </Link>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="p-8 text-center text-slate-500 max-w-md mx-auto">
        <p className="font-medium text-sm">Lead profile not found.</p>
        <Link to="/leads" className="mt-2 text-xs text-blue-600 hover:underline inline-block">
          Return to Leads
        </Link>
      </div>
    );
  }

  const statusName =
    typeof lead.status === 'object' && lead.status !== null
      ? lead.status.name
      : lead.statusName || lead.status || 'New Lead';

  const productName =
    typeof lead.product === 'object' && lead.product !== null
      ? lead.product.name
      : lead.product || 'Not Specified';

  const sourceName =
    typeof lead.source === 'object' && lead.source !== null
      ? lead.source.name
      : lead.source || 'Direct';

  const assignedName =
    typeof lead.assignedTo === 'object' && lead.assignedTo !== null
      ? lead.assignedTo.name
      : lead.assignedTo || 'Unassigned';

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

  const assignableUsers = lookupsData?.assignableUsers ?? [];
  const displayName = lead.leadName || lead.email || lead.mobile || 'Lead Details';

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

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Back button & Action Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <Link
          to="/leads"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 transition"
        >
          <ArrowLeft size={14} />
          <span>Back to All Leads</span>
        </Link>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              setSelectedStatusId(typeof lead.status === 'object' ? lead.status.id : 1);
              setIsStatusOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-amber-50 text-amber-800 border border-amber-200/80 hover:bg-amber-100 transition shadow-sm"
          >
            <ArrowRightCircle size={14} />
            <span>Change Status</span>
          </button>

          <button
            onClick={() => setIsAssignOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-purple-50 text-purple-800 border border-purple-200/80 hover:bg-purple-100 transition shadow-sm"
          >
            <UserCheck size={14} />
            <span>Reassign Lead</span>
          </button>

          <button
            onClick={openEditModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition"
          >
            <Edit2 size={14} />
            <span>Edit Profile</span>
          </button>
        </div>
      </div>

      {/* Hero Overview Card */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-2xl shadow-lg shadow-blue-500/20 flex-shrink-0">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
                {displayName}
              </h1>
              {lead.leadCode && (
                <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md border border-slate-200">
                  {lead.leadCode}
                </span>
              )}
            </div>
            {lead.companyName && (
              <p className="text-sm text-slate-600 font-medium mt-1 flex items-center gap-1.5">
                <Building2 size={15} className="text-slate-400" />
                <span>{lead.companyName}</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider block">Stage</span>
            <span className={`inline-block mt-0.5 text-xs font-bold px-3 py-1 rounded-full border ${getStatusColor(statusName)}`}>
              {statusName}
            </span>
          </div>
          <div className="text-right border-l border-slate-100 pl-3">
            <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider block">Priority</span>
            <span className="inline-block mt-0.5 text-xs font-bold text-slate-800 capitalize bg-slate-100 px-2.5 py-1 rounded-full">
              {lead.priority || 'Medium'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Details Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Contact Information */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold text-slate-900">Contact Information</CardTitle>
            <User size={16} className="text-slate-400" />
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="flex items-center justify-between py-2 border-b border-slate-100 text-sm">
              <span className="text-xs font-medium text-slate-400 flex items-center gap-2">
                <Mail size={14} /> Email Address
              </span>
              <span className="font-semibold text-slate-800 select-all">
                {lead.email || '—'}
              </span>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-slate-100 text-sm">
              <span className="text-xs font-medium text-slate-400 flex items-center gap-2">
                <Phone size={14} /> Mobile Phone
              </span>
              <span className="font-semibold text-slate-800 select-all">
                {lead.mobile || '—'}
              </span>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-slate-100 text-sm">
              <span className="text-xs font-medium text-slate-400 flex items-center gap-2">
                <Building2 size={14} /> Company
              </span>
              <span className="font-semibold text-slate-800">
                {lead.companyName || '—'}
              </span>
            </div>

            <div className="flex items-center justify-between py-2 text-sm">
              <span className="text-xs font-medium text-slate-400 flex items-center gap-2">
                <Calendar size={14} /> Creation Date
              </span>
              <span className="font-medium text-slate-700">
                {lead.createdAt ? new Date(lead.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Pipeline & Sales Ownership */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold text-slate-900">Pipeline & Ownership</CardTitle>
            <Layers size={16} className="text-slate-400" />
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="flex items-center justify-between py-2 border-b border-slate-100 text-sm">
              <span className="text-xs font-medium text-slate-400 flex items-center gap-2">
                <User size={14} /> Assigned Representative
              </span>
              <span className="font-semibold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-lg text-xs">
                {assignedName}
              </span>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-slate-100 text-sm">
              <span className="text-xs font-medium text-slate-400 flex items-center gap-2">
                <Layers size={14} /> Product Offering
              </span>
              <span className="font-semibold text-slate-800">
                {productName}
              </span>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-slate-100 text-sm">
              <span className="text-xs font-medium text-slate-400 flex items-center gap-2">
                <Compass size={14} /> Acquisition Source
              </span>
              <span className="font-semibold text-slate-800">
                {sourceName}
              </span>
            </div>

            <div className="flex items-center justify-between py-2 text-sm">
              <span className="text-xs font-medium text-slate-400 flex items-center gap-2">
                <CheckCircle2 size={14} /> Current Status
              </span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${getStatusColor(statusName)}`}>
                {statusName}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lost Reason Banner if Status is Lost */}
      {lead.lostReason && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3">
          <AlertTriangle size={18} className="text-rose-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-xs uppercase tracking-wider text-rose-900">Lead Disqualified / Lost Reason</h4>
            <p className="text-sm text-rose-700 mt-1 leading-relaxed">{lead.lostReason}</p>
          </div>
        </div>
      )}

      {/* Notes & Remarks Section */}
      {lead.remarks && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold text-slate-900">Notes & Internal Remarks</CardTitle>
            <FileText size={16} className="text-slate-400" />
          </CardHeader>
          <CardContent className="pt-3">
            <p className="text-sm text-slate-700 bg-slate-50 p-4 rounded-xl leading-relaxed border border-slate-100">
              {lead.remarks}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Edit Lead Modal */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
              <h2 className="text-base font-bold text-slate-900">Edit Lead Details</h2>
              <button onClick={() => setIsEditOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition">
                <X size={18} />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateMutation.mutate(editForm);
              }}
              className="p-6 space-y-4 text-sm"
            >
              {actionError && (
                <div className="p-3 text-xs bg-rose-50 text-rose-700 border border-rose-200 rounded-xl">
                  {actionError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Lead Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editForm.leadName}
                  onChange={(e) => setEditForm({ ...editForm, leadName: e.target.value })}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Company Name</label>
                <input
                  type="text"
                  value={editForm.companyName}
                  onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Email Address</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Mobile Phone</label>
                  <input
                    type="tel"
                    value={editForm.mobile}
                    onChange={(e) => setEditForm({ ...editForm, mobile: e.target.value })}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Priority</label>
                <select
                  value={editForm.priority}
                  onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition bg-white text-sm"
                >
                  <option value="high">High Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="low">Low Priority</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Remarks</label>
                <textarea
                  rows={2}
                  value={editForm.remarks}
                  onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition text-sm"
                />
              </div>
              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-500/20 transition disabled:opacity-50"
                >
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Status Modal */}
      {isStatusOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
              <h2 className="text-base font-bold text-slate-900">Update Pipeline Status</h2>
              <button onClick={() => setIsStatusOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition">
                <X size={18} />
              </button>
            </div>
            {actionError && (
              <div className="p-3 mx-6 mt-4 text-xs bg-rose-50 text-rose-700 border border-rose-200 rounded-xl">
                {actionError}
              </div>
            )}
            <div className="p-6 space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">New Stage</label>
                <select
                  value={selectedStatusId}
                  onChange={(e) => setSelectedStatusId(Number(e.target.value))}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition bg-white text-sm"
                >
                  {statuses.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedStatusId === 8 && (
                <div>
                  <label className="block text-xs font-semibold text-rose-600 uppercase tracking-wider mb-1">
                    Lost Reason <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Budget constraints, chose competitor..."
                    value={lostReason}
                    onChange={(e) => setLostReason(e.target.value)}
                    className="w-full px-3.5 py-2 border border-rose-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition text-sm"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsStatusOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={statusMutation.isPending}
                  onClick={() => statusMutation.mutate({ statusId: selectedStatusId, lostReason: selectedStatusId === 8 ? lostReason : undefined })}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-amber-500/20 transition disabled:opacity-50"
                >
                  {statusMutation.isPending ? 'Updating...' : 'Update Status'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reassign Modal */}
      {isAssignOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
              <h2 className="text-base font-bold text-slate-900">Reassign Lead</h2>
              <button onClick={() => setIsAssignOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition">
                <X size={18} />
              </button>
            </div>
            {actionError && (
              <div className="p-3 mx-6 mt-4 text-xs bg-rose-50 text-rose-700 border border-rose-200 rounded-xl">
                {actionError}
              </div>
            )}
            <div className="p-6 space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Assign To Representative</label>
                <select
                  value={selectedAssignee}
                  onChange={(e) => setSelectedAssignee(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition bg-white text-sm"
                >
                  <option value="">Select Representative...</option>
                  {assignableUsers.map((u: any) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.roleCode})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Reason for Reassignment</label>
                <input
                  type="text"
                  placeholder="e.g. Territory change, workload balance..."
                  value={assignReason}
                  onChange={(e) => setAssignReason(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition text-sm"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAssignOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={assignMutation.isPending || !selectedAssignee}
                  onClick={() => assignMutation.mutate({ assignedTo: selectedAssignee, reason: assignReason })}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-purple-500/20 transition disabled:opacity-50"
                >
                  {assignMutation.isPending ? 'Assigning...' : 'Reassign Lead'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
