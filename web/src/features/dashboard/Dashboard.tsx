import { useQuery } from '@tanstack/react-query';
import client from '@/shared/api/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/ui/Card';

interface DashboardResponse {
  summary?: {
    totalLeads: number;
    newLeads: number;
    convertedLeads: number;
    lostLeads: number;
  };
  leadsByStatus?: Array<{ statusId: number; statusName: string; count: number }>;
  leadsByProduct?: Array<{ productId: number; productCode: string; productName: string; count: number }>;
  leadsBySource?: Array<{ sourceId: number; sourceName: string; isMarketing: boolean; count: number }>;
  pendingFollowUps?: {
    today: number;
    overdue: number;
    total: number;
  };
  pendingTasks?: {
    overdue: number;
    total: number;
  };
  totalLeads?: number;
  newLeads?: number;
  followUpsDue?: number;
  convertedLeads?: number;
  conversionPct?: number;
}

export default function Dashboard() {
  const { data, isLoading, isError } = useQuery<DashboardResponse>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      try {
        const res = await client.get('/dashboard');
        return res.data.data;
      } catch {
        const res = await client.get('/reports/dashboard');
        return res.data.data;
      }
    },
  });

  if (isLoading) {
    return <div className="flex justify-center p-8 text-gray-600">Loading dashboard…</div>;
  }
  if (isError) {
    return <div className="p-8 text-red-600 font-semibold">Failed to load dashboard.</div>;
  }

  const totalLeads = data?.summary?.totalLeads ?? data?.totalLeads ?? 0;
  const newLeads = data?.summary?.newLeads ?? data?.newLeads ?? 0;
  const convertedLeads = data?.summary?.convertedLeads ?? data?.convertedLeads ?? 0;
  const lostLeads = data?.summary?.lostLeads ?? 0;
  const followUpsDue = data?.pendingFollowUps?.total ?? data?.followUpsDue ?? 0;
  const pendingTasks = data?.pendingTasks?.total ?? 0;
  const conversionPct =
    totalLeads > 0
      ? Math.round((convertedLeads / totalLeads) * 100)
      : data?.conversionPct ?? 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Total Leads</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{totalLeads}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>New Leads</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{newLeads}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Converted Leads</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold text-green-600">{convertedLeads}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Lost Leads</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold text-gray-500">{lostLeads}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Follow‑ups Due</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold text-amber-600">{followUpsDue}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Pending Tasks</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold text-blue-600">{pendingTasks}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Conversion Rate</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{conversionPct}%</CardContent>
        </Card>
      </div>

      {data?.leadsByStatus && data.leadsByStatus.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-700 mb-3">Leads by Status</h2>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            {data.leadsByStatus.map((st) => (
              <div key={st.statusId} className="bg-white p-3 rounded shadow-sm border">
                <span className="text-sm text-gray-500">{st.statusName}</span>
                <p className="text-xl font-bold">{st.count}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
