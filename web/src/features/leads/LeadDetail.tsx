// src/features/leads/LeadDetail.tsx
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '@/shared/api/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/ui/Card';

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['lead', id],
    queryFn: async () => {
      const res = await api.get(`/leads/${id}`);
      return res.data.data ?? res.data;
    },
    enabled: !!id,
  });

  if (isLoading) return <div className="text-gray-500 p-8">Loading lead details…</div>;
  if (isError) return <div className="text-red-600 p-8">Failed to load lead.</div>;

  const lead = data?.lead || data;
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

  return (
    <div className="space-y-4 max-w-3xl">
      <Link to="/leads" className="text-sm text-blue-600 hover:underline">
        ← Back to Leads
      </Link>
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
          {lead.remarks && (
            <div className="pt-3">
              <span className="text-gray-500 block text-xs mb-1">Remarks</span>
              <p className="text-gray-700 bg-gray-50 p-3 rounded">{lead.remarks}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
