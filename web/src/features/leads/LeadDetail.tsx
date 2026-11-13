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
  CheckCircle2,
  CalendarPlus,
  History,
  Activity,
  Plus
} from 'lucide-react';

interface FollowUp {
  id: string;
  leadId: string;
  type: string;
  status: string;
  scheduledAt: string;
  notes: string | null;
  outcome: string | null;
  assignedToName?: string;
  assignedTo?: { id: string; name: string } | null;
}

interface LeadActivity {
  id: string;
  leadId: string;
  type: string;
  subject: string;
  notes: string | null;
  outcome: string | null;
  occurredAt: string;
  authorName?: string;
  author?: { id: string; name: string } | null;
}

interface LeadAssignment {
  id: string;
  leadId: string;
  fromUserName: string | null;
  toUserName: string;
  assignedByName: string;
  reason: string | null;
  assignedAt: string;
}

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'overview' | 'followups' | 'activities' | 'assignments'>('overview');

  // Modals state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isFollowupOpen, setIsFollowupOpen] = useState(false);
  const [isActivityOpen, setIsActivityOpen] = useState(false);
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

  // Schedule follow-up state
  const tomorrow = new Date(Date.now() + 86400000);
  tomorrow.setHours(10, 0, 0, 0);
  const [followupForm, setFollowupForm] = useState({
    scheduledAt: tomorrow.toISOString().slice(0, 16),
    type: 'call' as 'call' | 'email' | 'meeting' | 'whatsapp' | 'other',
    notes: '',
  });

  // Activity log state
  const [activityForm, setActivityForm] = useState({
    type: 'call' as 'call' | 'email' | 'meeting' | 'note',
    subject: '',
    notes: '',
    outcome: '',
  });

  // 1. Fetch Lead
  const { data, isLoading, isError } = useQuery({
    queryKey: ['lead', id],
    queryFn: async () => {
      const res = await api.get(`/leads/${id}`);
      return res.data.data ?? res.data;
    },
    enabled: !!id,
  });

  // 2. Fetch Lookups
  const { data: lookupsData } = useQuery({
    queryKey: ['lead-lookups'],
    queryFn: async () => {
      const res = await api.get('/leads/lookups');
      return res.data.data ?? res.data;
    },
  });

  // 3. Fetch Follow-ups for this lead
  const { data: followupsData } = useQuery<{ followups: FollowUp[] }>({
    queryKey: ['lead-followups', id],
    queryFn: async () => {
      const res = await api.get(`/followups?leadId=${id}`);
      return res.data.data ?? res.data;
    },
    enabled: !!id,
  });

  // 4. Fetch Activities for this lead
  const { data: activitiesData } = useQuery<{ activities: LeadActivity[] }>({
    queryKey: ['lead-activities', id],
    queryFn: async () => {
      const res = await api.get(`/leads/${id}/activities`);
      return res.data.data ?? res.data;
    },
    enabled: !!id,
  });

  // 5. Fetch Assignment History
  const { data: assignmentsData } = useQuery<{ assignments: LeadAssignment[] }>({
    queryKey: ['lead-assignments', id],
    queryFn: async () => {
      const res = await api.get(`/leads/${id}/assignments`);
      return res.data.data ?? res.data;
    },
    enabled: !!id,
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
      queryClient.invalidateQueries({ queryKey: ['lead-assignments', id] });
      setIsAssignOpen(false);
      setActionError(null);
    },
    onError: (err: any) => {
      setActionError(err.response?.data?.message || 'Failed to reassign lead');
    },
  });

  // Create follow-up mutation
  const createFollowupMutation = useMutation({
    mutationFn: async (payload: typeof followupForm) => {
      const res = await api.post('/followups', {
        leadId: id,
        scheduledAt: new Date(payload.scheduledAt).toISOString(),
        type: payload.type,
        notes: payload.notes || undefined,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-followups', id] });
      queryClient.invalidateQueries({ queryKey: ['lead', id] });
      setIsFollowupOpen(false);
      setActionError(null);
      setFollowupForm({
        scheduledAt: tomorrow.toISOString().slice(0, 16),
        type: 'call',
        notes: '',
      });
    },
    onError: (err: any) => {
      setActionError(err.response?.data?.message || err.response?.data?.error?.details?.[0]?.message || 'Failed to schedule follow-up');
    },
  });

  // Complete follow-up mutation
  const completeFollowupMutation = useMutation({
    mutationFn: async (followupId: string) => {
      const res = await api.patch(`/followups/${followupId}/status`, {
        status: 'completed',
        outcome: 'Completed on schedule',
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-followups', id] });
      queryClient.invalidateQueries({ queryKey: ['lead', id] });
    },
  });

  // Log activity mutation
  const createActivityMutation = useMutation({
    mutationFn: async (payload: typeof activityForm) => {
      const res = await api.post(`/leads/${id}/activities`, {
        type: payload.type,
        subject: payload.subject,
        notes: payload.notes || undefined,
        outcome: payload.outcome || undefined,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-activities', id] });
      setIsActivityOpen(false);
      setActionError(null);
      setActivityForm({
        type: 'call',
        subject: '',
        notes: '',
        outcome: '',
      });
    },
    onError: (err: any) => {
      setActionError(err.response?.data?.message || 'Failed to log activity');
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

  const followupsList = followupsData?.followups ?? (Array.isArray(followupsData) ? followupsData : []);
  const activitiesList = activitiesData?.activities ?? (Array.isArray(activitiesData) ? activitiesData : []);
  const assignmentsList = assignmentsData?.assignments ?? (Array.isArray(assignmentsData) ? assignmentsData : []);

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

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              setActionError(null);
              setIsFollowupOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-blue-50 text-blue-700 border border-blue-200/80 hover:bg-blue-100 transition shadow-sm"
          >
            <CalendarPlus size={14} />
            <span>Schedule Follow-up</span>
          </button>

          <button
            onClick={() => {
              setActionError(null);
              setIsActivityOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition shadow-sm"
          >
            <Activity size={14} />
            <span>Log Activity</span>
          </button>

          <button
            onClick={() => {
              setSelectedStatusId(typeof lead.status === 'object' ? lead.status.id : 1);
              setIsStatusOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-amber-50 text-amber-800 border border-amber-200/80 hover:bg-amber-100 transition shadow-sm"
          >
            <ArrowRightCircle size={14} />
            <span>Change Status</span>
          </button>

          <button
            onClick={() => setIsAssignOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-purple-50 text-purple-800 border border-purple-200/80 hover:bg-purple-100 transition shadow-sm"
          >
            <UserCheck size={14} />
            <span>Reassign</span>
          </button>

          <button
            onClick={openEditModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 transition"
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

      {/* Tabs navigation */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/60 rounded-xl max-w-fit">
        {[
          { id: 'overview', label: 'Lead Overview', icon: FileText },
          { id: 'followups', label: `Follow-ups (${followupsList.length})`, icon: CalendarPlus },
          { id: 'activities', label: `Activities (${activitiesList.length})`, icon: Activity },
          { id: 'assignments', label: `History (${assignmentsList.length})`, icon: History },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all ${
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

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
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
        </div>
      )}

      {/* TAB 2: FOLLOW-UPS */}
      {activeTab === 'followups' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-slate-900">Follow-up Engagements</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">Automated cron reminder and call scheduling</p>
            </div>
            <button
              onClick={() => setIsFollowupOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-semibold shadow hover:bg-blue-700 transition"
            >
              <Plus size={14} /> Schedule Follow-up
            </button>
          </CardHeader>

          <CardContent className="pt-3">
            {followupsList.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <CalendarPlus size={24} className="mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-medium">No follow-ups scheduled yet.</p>
                <button
                  onClick={() => setIsFollowupOpen(true)}
                  className="mt-2 text-xs font-semibold text-blue-600 hover:underline"
                >
                  Schedule the next call or meeting &rarr;
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {followupsList.map((f: any) => (
                  <div
                    key={f.id}
                    className="p-4 rounded-xl border border-slate-200/80 bg-white shadow-sm flex items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                          {f.type}
                        </span>
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          f.status === 'completed' 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {f.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 font-medium">
                        Due: <strong>{new Date(f.scheduledAt).toLocaleString()}</strong>
                      </p>
                      {f.notes && <p className="text-xs text-slate-500 italic mt-1">{f.notes}</p>}
                    </div>

                    {f.status !== 'completed' && (
                      <button
                        onClick={() => completeFollowupMutation.mutate(f.id)}
                        disabled={completeFollowupMutation.isPending}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-semibold transition"
                      >
                        <CheckCircle2 size={13} />
                        <span>Mark Complete</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 3: ACTIVITIES */}
      {activeTab === 'activities' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-slate-900">Interaction Timeline</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">Calls, emails, customer notes, and meetings</p>
            </div>
            <button
              onClick={() => setIsActivityOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-xl text-xs font-semibold shadow hover:bg-slate-800 transition"
            >
              <Plus size={14} /> Log Activity
            </button>
          </CardHeader>

          <CardContent className="pt-3">
            {activitiesList.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <Activity size={24} className="mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-medium">No activities recorded yet.</p>
                <button
                  onClick={() => setIsActivityOpen(true)}
                  className="mt-2 text-xs font-semibold text-blue-600 hover:underline"
                >
                  Log the first call or meeting notes &rarr;
                </button>
              </div>
            ) : (
              <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {activitiesList.map((a: any) => (
                  <div key={a.id} className="relative">
                    <span className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-blue-600 ring-4 ring-white" />
                    <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/70 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 text-sm">{a.subject}</span>
                        <span className="text-[11px] text-slate-400">
                          {new Date(a.occurredAt || a.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-500">
                        <span className="capitalize font-semibold text-blue-600">{a.type}</span>
                        {a.outcome && <span>• Outcome: {a.outcome}</span>}
                      </div>
                      {a.notes && <p className="text-slate-600 mt-1 leading-relaxed">{a.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 4: ASSIGNMENT HISTORY */}
      {activeTab === 'assignments' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-bold text-slate-900">Immutable Assignment History</CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">Audit trail of lead ownership transfers</p>
          </CardHeader>

          <CardContent className="pt-2">
            {assignmentsList.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                No reassignment events logged. Lead is with initial assignee.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      <th className="py-2.5 px-3">Date & Time</th>
                      <th className="py-2.5 px-3">From</th>
                      <th className="py-2.5 px-3">To Assignee</th>
                      <th className="py-2.5 px-3">Assigned By</th>
                      <th className="py-2.5 px-3">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {assignmentsList.map((as: any) => (
                      <tr key={as.id} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 text-slate-500 font-medium">
                          {new Date(as.assignedAt).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 font-medium">{as.fromUserName || 'Unassigned'}</td>
                        <td className="py-2.5 px-3 font-bold text-blue-600">{as.toUserName}</td>
                        <td className="py-2.5 px-3 text-slate-500">{as.assignedByName}</td>
                        <td className="py-2.5 px-3 text-slate-600 italic">{as.reason || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Modal 1: Schedule Follow-up */}
      {isFollowupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
              <h2 className="text-base font-bold text-slate-900">Schedule Lead Follow-up</h2>
              <button onClick={() => setIsFollowupOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition">
                <X size={18} />
              </button>
            </div>
            {actionError && (
              <div className="p-3 mx-6 mt-4 text-xs bg-rose-50 text-rose-700 border border-rose-200 rounded-xl">
                {actionError}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createFollowupMutation.mutate(followupForm);
              }}
              className="p-6 space-y-4 text-sm"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Scheduled Date & Time <span className="text-rose-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  required
                  value={followupForm.scheduledAt}
                  onChange={(e) => setFollowupForm({ ...followupForm, scheduledAt: e.target.value })}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition text-sm bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Channel / Type</label>
                <select
                  value={followupForm.type}
                  onChange={(e) => setFollowupForm({ ...followupForm, type: e.target.value as any })}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition text-sm bg-white"
                >
                  <option value="call">Phone Call</option>
                  <option value="meeting">Video / In-person Meeting</option>
                  <option value="email">Email Outreach</option>
                  <option value="whatsapp">WhatsApp / Messaging</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Agenda / Reminders</label>
                <textarea
                  rows={2}
                  placeholder="Review pricing proposal, clarify technical integration..."
                  value={followupForm.notes}
                  onChange={(e) => setFollowupForm({ ...followupForm, notes: e.target.value })}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition text-sm"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsFollowupOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createFollowupMutation.isPending}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-500/20 transition disabled:opacity-50"
                >
                  {createFollowupMutation.isPending ? 'Scheduling...' : 'Confirm Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Log Activity */}
      {isActivityOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
              <h2 className="text-base font-bold text-slate-900">Record Sales Activity</h2>
              <button onClick={() => setIsActivityOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition">
                <X size={18} />
              </button>
            </div>
            {actionError && (
              <div className="p-3 mx-6 mt-4 text-xs bg-rose-50 text-rose-700 border border-rose-200 rounded-xl">
                {actionError}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createActivityMutation.mutate(activityForm);
              }}
              className="p-6 space-y-4 text-sm"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Subject / Summary <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Discussed LearnProfessional enterprise tiers"
                  value={activityForm.subject}
                  onChange={(e) => setActivityForm({ ...activityForm, subject: e.target.value })}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Activity Type</label>
                  <select
                    value={activityForm.type}
                    onChange={(e) => setActivityForm({ ...activityForm, type: e.target.value as any })}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition text-sm bg-white"
                  >
                    <option value="call">Call</option>
                    <option value="meeting">Meeting</option>
                    <option value="email">Email</option>
                    <option value="note">Internal Note</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Outcome</label>
                  <input
                    type="text"
                    placeholder="e.g. Positive, follow up on Tuesday"
                    value={activityForm.outcome}
                    onChange={(e) => setActivityForm({ ...activityForm, outcome: e.target.value })}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">Detailed Discussion Notes</label>
                <textarea
                  rows={2}
                  placeholder="Points discussed, objections raised, next steps agreed..."
                  value={activityForm.notes}
                  onChange={(e) => setActivityForm({ ...activityForm, notes: e.target.value })}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition text-sm"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsActivityOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createActivityMutation.isPending}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow transition disabled:opacity-50"
                >
                  {createActivityMutation.isPending ? 'Logging...' : 'Save Activity'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Edit Profile */}
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

      {/* Modal 4: Change Status */}
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

      {/* Modal 5: Reassign Lead */}
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
