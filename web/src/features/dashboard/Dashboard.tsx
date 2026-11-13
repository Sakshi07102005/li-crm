import { useQuery } from '@tanstack/react-query';
import client from '@/shared/api/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/ui/Card';

export default function Dashboard() {
  const { data, isLoading, isError } = useQuery(['dashboard'], async () => {
    const res = await client.get('/reports/dashboard');
    return res.data.data;
  });

  if (isLoading) {
    return <div className="flex justify-center p-8">Loading dashboard…</div>;
  }
  if (isError) {
    return <div className="p-8 text-red-600">Failed to load dashboard.</div>;
  }

  // Assuming data has totalLeads, newLeads, followUpsDue, convertedLeads, conversionPct
  const {
    totalLeads = 0,
    newLeads = 0,
    followUpsDue = 0,
    convertedLeads = 0,
    conversionPct = 0,
  } = data ?? {};

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 p-6">
      <Card>
        <CardHeader><CardTitle>Total Leads</CardTitle></CardHeader>
        <CardContent>{totalLeads}</CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>New Leads</CardTitle></CardHeader>
        <CardContent>{newLeads}</CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Follow‑ups Due</CardTitle></CardHeader>
        <CardContent>{followUpsDue}</CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Converted Leads</CardTitle></CardHeader>
        <CardContent>{convertedLeads}</CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Conversion %</CardTitle></CardHeader>
        <CardContent>{conversionPct}%</CardContent>
      </Card>
    </div>
  );
}

