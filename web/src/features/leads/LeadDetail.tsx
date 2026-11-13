// src/features/leads/LeadDetail.tsx
import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/shared/api/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/ui/Card';
import { Edit2, UserCheck, ArrowRightCircle, X } from 'lucide-react';

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

  if (isLoading) return <div className="text-gray-500 p-8">Loading lead details…</div>;
  if (isError) return <div className="text-red-600 p-8">Failed to load lead.</div>;
  if (!lead) return <div className="text-gray-500 p-8">Lead not found.</div>;

  const statusName =
    typeof lead.status === 'object' && lead.status !== null
      ? lead.status.name
      : lead.statusName || lead.status || 'New';

  const productName =
    typeof lead.product === 'object' && lead.product !== null
      ? lead.product.name
      : lead.product || 'N/A';

  const sourceName =
    typeof lead.source === 'object' && lead.source !== null
      ? lead.source.name
      : lead.source || 'N/A';

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

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <Link to="/leads" className="text-sm text-blue-600 hover:underline">
          ← Back to Leads
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setSelectedStatusId(typeof lead.status === 'object' ? lead.status.id : 1);
              setIsStatusOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition"
          >
            <ArrowRightCircle size={14} />
            Change Status
          </button>
          <button
            onClick={() => setIsAssignOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition"
          >
            <UserCheck size={14} />
            Reassign
          </button>
          <button
            onClick={openEditModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-blue-600 text-white hover:bg-blue-700 transition"
          >
            <Edit2 size={14} />
            Edit Lead
          </button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex justify-between items-start">
          <div>
            <CardTitle className="text-xl font-bold">
              {lead.leadName || lead.email || lead.mobile || 'Lead Details'}
            </CardTitle>
            {lead.leadCode && (
              <span className="text-xs text-gray-400 font-mono">{lead.leadCode}</span>
            )}
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded bg-blue-100 text-blue-800">
            {statusName}
          </span>
        </CardHeader>
        <CardContent className="space-y-3 text-sm divide-y divide-gray-100">
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div>
              <span className="text-gray-500 block text-xs">Email</span>
              <span className="font-medium">{lead.email || '—'}</span>
            </div>
            <div>
              <span className="text-gray-500 block text-xs">Mobile</span>
              <span className="font-medium">{lead.mobile || '—'}</span>
            </div>
            <div>
              <span className="text-gray-500 block text-xs">Company</span>
              <span className="font-medium">{lead.companyName || '—'}</span>
            </div>
            <div>
              <span className="text-gray-500 block text-xs">Priority</span>
              <span className="font-medium capitalize">{lead.priority || 'Normal'}</span>
            </div>
            <div>
              <span className="text-gray-500 block text-xs">Product</span>
              <span className="font-medium">{productName}</span>
            </div>
            <div>
              <span className="text-gray-500 block text-xs">Source</span>
              <span className="font-medium">{sourceName}</span>
            </div>
            <div>
              <span className="text-gray-500 block text-xs">Assigned To</span>
              <span className="font-medium">{assignedName}</span>
            </div>
            <div>
              <span className="text-gray-500 block text-xs">Created At</span>
              <span className="font-medium">
                {lead.createdAt ? new Date(lead.createdAt).toLocaleString() : '—'}
              </span>
            </div>
          </div>
          {lead.lostReason && (
            <div className="pt-3">
              <span className="text-red-500 block text-xs mb-1 font-semibold">Lost Reason</span>
              <p className="text-red-700 bg-red-50 p-2.5 rounded text-xs">{lead.lostReason}</p>
            </div>
          )}
          {lead.remarks && (
            <div className="pt-3">
              <span className="text-gray-500 block text-xs mb-1">Remarks</span>
              <p className="text-gray-700 bg-gray-50 p-3 rounded">{lead.remarks}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Lead Modal */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-5">
            <div className="flex items-center justify-between pb-3 border-b">
              <h2 className="text-base font-bold text-gray-800">Edit Lead Details</h2>
              <button onClick={() => setIsEditOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateMutation.mutate(editForm);
              }}
              className="space-y-3 pt-3 text-sm"
            >
              {actionError && (
                <div className="p-2 text-xs bg-red-50 text-red-700 border border-red-200 rounded">
                  {actionError}
                </div>
              )}
              <div>
                <label className="block text-gray-700 font-medium text-xs mb-1">Lead Name</label>
                <input
                  type="text"
                  required
                  value={editForm.leadName}
                  onChange={(e) => setEditForm({ ...editForm, leadName: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded outline-none"
                />
              </div>
              <div>
                <label className="block text-gray-700 font-medium text-xs mb-1">Company Name</label>
                <input
                  type="text"
                  value={editForm.companyName}
                  onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-700 font-medium text-xs mb-1">Email</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full px-3 py-1.5 border rounded outline-none"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium text-xs mb-1">Mobile</label>
                  <input
                    type="tel"
                    value={editForm.mobile}
                    onChange={(e) => setEditForm({ ...editForm, mobile: e.target.value })}
                    className="w-full px-3 py-1.5 border rounded outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-gray-700 font-medium text-xs mb-1">Priority</label>
                <select
                  value={editForm.priority}
                  onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded outline-none bg-white"
                >
                  <option value="high">High Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="low">Low Priority</option>
                </select>
              </div>
              <div>
                <label className="block text-gray-700 font-medium text-xs mb-1">Remarks</label>
                <textarea
                  rows={2}
                  value={editForm.remarks}
                  onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-3 py-1.5 border rounded text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="px-4 py-1.5 bg-blue-600 text-white rounded text-xs font-semibold"
                >
                  {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Status Modal */}
      {isStatusOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-4">
            <h2 className="text-base font-bold text-gray-800 mb-3">Update Pipeline Status</h2>
            {actionError && (
              <div className="p-2 text-xs bg-red-50 text-red-700 border border-red-200 rounded mb-2">
                {actionError}
              </div>
            )}
            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-gray-700 text-xs font-medium mb-1">New Status</label>
                <select
                  value={selectedStatusId}
                  onChange={(e) => setSelectedStatusId(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded bg-white text-sm"
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
                  <label className="block text-gray-700 text-xs font-medium mb-1">
                    Lost Reason <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Budget constraints, opted for competitor..."
                    value={lostReason}
                    onChange={(e) => setLostReason(e.target.value)}
                    className="w-full px-3 py-1.5 border rounded text-sm"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setIsStatusOpen(false)}
                  className="px-3 py-1.5 border rounded text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={statusMutation.isPending}
                  onClick={() => statusMutation.mutate({ statusId: selectedStatusId, lostReason: selectedStatusId === 8 ? lostReason : undefined })}
                  className="px-4 py-1.5 bg-amber-600 text-white rounded text-xs font-semibold"
                >
                  {statusMutation.isPending ? 'Updating…' : 'Update Status'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reassign Modal */}
      {isAssignOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-4">
            <h2 className="text-base font-bold text-gray-800 mb-3">Reassign Lead</h2>
            {actionError && (
              <div className="p-2 text-xs bg-red-50 text-red-700 border border-red-200 rounded mb-2">
                {actionError}
              </div>
            )}
            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-gray-700 text-xs font-medium mb-1">Assign To</label>
                <select
                  value={selectedAssignee}
                  onChange={(e) => setSelectedAssignee(e.target.value)}
                  className="w-full px-3 py-2 border rounded bg-white text-sm"
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
                <label className="block text-gray-700 text-xs font-medium mb-1">Reason for Reassignment</label>
                <input
                  type="text"
                  placeholder="e.g. Territory change, workload rebalance..."
                  value={assignReason}
                  onChange={(e) => setAssignReason(e.target.value)}
                  className="w-full px-3 py-1.5 border rounded text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setIsAssignOpen(false)}
                  className="px-3 py-1.5 border rounded text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={assignMutation.isPending || !selectedAssignee}
                  onClick={() => assignMutation.mutate({ assignedTo: selectedAssignee, reason: assignReason })}
                  className="px-4 py-1.5 bg-purple-600 text-white rounded text-xs font-semibold disabled:opacity-50"
                >
                  {assignMutation.isPending ? 'Assigning…' : 'Reassign Lead'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
