// src/features/leads/LeadsList.tsx
import { useQuery } from '@tanstack/react-query';
import api from '@/shared/api/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/ui/Card';
import { Link } from 'react-router-dom';

export default function LeadsList() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['leads'],
    queryFn: async () => {
      const res = await api.get('/leads');
      return res.data.data ?? res.data;
    },
  });

  if (isLoading) return <div className="text-gray-500 p-8">Loading leads…</div>;
  if (isError) return <div className="text-red-600 p-8">Failed to load leads.</div>;

  const leads = data?.leads ?? (Array.isArray(data) ? data : []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Leads</h1>
        <span className="text-sm font-medium text-gray-500 bg-gray-200 px-3 py-1 rounded-full">
          Total: {data?.meta?.total ?? leads.length}
        </span>
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
    </div>
  );
}
