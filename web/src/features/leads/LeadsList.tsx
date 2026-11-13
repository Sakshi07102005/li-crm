// src/features/leads/LeadsList.tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/shared/api/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/ui/Card';
import { Link } from 'react-router-dom';
import { Plus, X } from 'lucide-react';

export default function LeadsList() {
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
      const msg = err.response?.data?.message || err.response?.data?.error?.details?.[0]?.message || 'Failed to create lead';
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

  if (isLoading) return <div className="text-gray-500 p-8">Loading leads…</div>;
  if (isError) return <div className="text-red-600 p-8">Failed to load leads.</div>;

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-800">Leads</h1>
          <span className="text-sm font-medium text-gray-500 bg-gray-200 px-3 py-1 rounded-full">
            Total: {data?.meta?.total ?? leads.length}
          </span>
        </div>
        <button
          onClick={() => setIsAddOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg shadow hover:bg-blue-700 transition"
        >
          <Plus size={16} />
          Add Lead
        </button>
      </div>

      {leads.length === 0 ? (
        <p className="text-gray-500">No leads found.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {leads.map((lead: any) => {
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

            return (
              <Card key={lead.id} className="hover:shadow-md transition">
                <CardHeader className="flex justify-between items-start pb-2">
                  <div>
                    <CardTitle className="text-base font-semibold text-gray-900">
                      {lead.leadName || lead.email || lead.mobile || 'Unnamed Lead'}
                    </CardTitle>
                    {lead.leadCode && (
                      <span className="text-xs text-gray-400 font-mono">{lead.leadCode}</span>
                    )}
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-blue-100 text-blue-800">
                    {statusName}
                  </span>
                </CardHeader>
                <CardContent className="space-y-1.5 text-sm">
                  {lead.companyName && (
                    <p className="text-gray-600">
                      🏢 <span className="font-medium text-gray-800">{lead.companyName}</span>
                    </p>
                  )}
                  {lead.email && <p className="text-gray-600 truncate">✉️ {lead.email}</p>}
                  {lead.mobile && <p className="text-gray-600">📞 {lead.mobile}</p>}
                  {productName && (
                    <p className="text-gray-500 text-xs">Product: {productName}</p>
                  )}
                  <div className="pt-2 flex items-center justify-between border-t border-gray-100 mt-2">
                    <span className="text-xs text-gray-500">Assignee: {assignedName}</span>
                    <Link
                      to={`/leads/${lead.id}`}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      View details →
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Lead Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-bold text-gray-800">Create New Lead</h2>
              <button
                onClick={() => setIsAddOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4 text-sm">
              {formError && (
                <div className="p-3 text-xs bg-red-50 text-red-700 border border-red-200 rounded">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-gray-700 font-medium mb-1">
                  Lead Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Ronald Vance"
                  value={formData.leadName}
                  onChange={(e) => setFormData({ ...formData, leadName: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">Company Name</label>
                <input
                  type="text"
                  placeholder="e.g. Vance Health Solutions"
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="name@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Mobile</label>
                  <input
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={formData.mobile}
                    onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Product</label>
                  <select
                    value={formData.productId}
                    onChange={(e) => setFormData({ ...formData, productId: Number(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                  >
                    {products.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-gray-700 font-medium mb-1">Source</label>
                  <select
                    value={formData.sourceId}
                    onChange={(e) => setFormData({ ...formData, sourceId: Number(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
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
                <label className="block text-gray-700 font-medium mb-1">Priority</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                >
                  <option value="high">High Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="low">Low Priority</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-700 font-medium mb-1">Remarks</label>
                <textarea
                  rows={2}
                  placeholder="Notes, requirements, budget..."
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating…' : 'Create Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
