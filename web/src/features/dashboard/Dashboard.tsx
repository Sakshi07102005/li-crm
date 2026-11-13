import { useQuery } from '@tanstack/react-query';
import client from '@/shared/api/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/ui/Card';
import { 
  Users, 
  UserPlus, 
  CheckCircle2, 
  XCircle, 
  CalendarClock, 
  ListTodo, 
  TrendingUp, 
  Layers, 
  Compass,
  ArrowUpRight
} from 'lucide-react';

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
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-slate-200 rounded-lg w-48" />
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-slate-200 rounded-xl" />
          ))}
        </div>
        <div className="h-64 bg-slate-200 rounded-xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 rounded-xl bg-rose-50 border border-rose-200 text-rose-700">
        <h3 className="font-semibold text-base">Failed to load dashboard metrics</h3>
        <p className="text-sm mt-1 text-rose-600">Please verify backend service status or try refreshing.</p>
      </div>
    );
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

  const kpis = [
    {
      title: 'Total Pipeline Leads',
      value: totalLeads,
      icon: Users,
      color: 'blue',
      bgColor: 'bg-blue-50 text-blue-600 border-blue-100',
      badge: 'All Active',
    },
    {
      title: 'New Inquiries',
      value: newLeads,
      icon: UserPlus,
      color: 'indigo',
      bgColor: 'bg-indigo-50 text-indigo-600 border-indigo-100',
      badge: 'Uncontacted',
    },
    {
      title: 'Converted Deals',
      value: convertedLeads,
      icon: CheckCircle2,
      color: 'emerald',
      bgColor: 'bg-emerald-50 text-emerald-600 border-emerald-100',
      badge: `${conversionPct}% Rate`,
    },
    {
      title: 'Follow-ups Due',
      value: followUpsDue,
      icon: CalendarClock,
      color: 'amber',
      bgColor: 'bg-amber-50 text-amber-600 border-amber-100',
      badge: `${data?.pendingFollowUps?.overdue ?? 0} overdue`,
    },
    {
      title: 'Open Tasks',
      value: pendingTasks,
      icon: ListTodo,
      color: 'sky',
      bgColor: 'bg-sky-50 text-sky-600 border-sky-100',
      badge: `${data?.pendingTasks?.overdue ?? 0} overdue`,
    },
    {
      title: 'Lost / Disqualified',
      value: lostLeads,
      icon: XCircle,
      color: 'slate',
      bgColor: 'bg-slate-100 text-slate-600 border-slate-200',
      badge: 'Archived',
    },
    {
      title: 'Conversion Efficiency',
      value: `${conversionPct}%`,
      icon: TrendingUp,
      color: 'emerald',
      bgColor: 'bg-emerald-50 text-emerald-600 border-emerald-100',
      badge: 'Lead to Win',
    },
  ];

  const getStatusColor = (statusName: string) => {
    const s = statusName.toLowerCase();
    if (s.includes('new')) return { bg: 'bg-blue-50', text: 'text-blue-700', bar: 'bg-blue-500' };
    if (s.includes('contact')) return { bg: 'bg-sky-50', text: 'text-sky-700', bar: 'bg-sky-500' };
    if (s.includes('interest')) return { bg: 'bg-indigo-50', text: 'text-indigo-700', bar: 'bg-indigo-500' };
    if (s.includes('meeting')) return { bg: 'bg-purple-50', text: 'text-purple-700', bar: 'bg-purple-500' };
    if (s.includes('proposal')) return { bg: 'bg-amber-50', text: 'text-amber-700', bar: 'bg-amber-500' };
    if (s.includes('negot')) return { bg: 'bg-orange-50', text: 'text-orange-700', bar: 'bg-orange-500' };
    if (s.includes('convert')) return { bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-500' };
    if (s.includes('lost')) return { bg: 'bg-rose-50', text: 'text-rose-700', bar: 'bg-rose-500' };
    return { bg: 'bg-slate-50', text: 'text-slate-700', bar: 'bg-slate-500' };
  };

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Executive Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">Real-time pipeline metrics, lead conversions, and team activity</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">
            Live Feed: Operational
          </span>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.slice(0, 4).map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div
              key={idx}
              className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{kpi.title}</p>
                  <p className="text-3xl font-extrabold text-slate-900 mt-2 tracking-tight">{kpi.value}</p>
                </div>
                <div className={`p-2.5 rounded-xl border ${kpi.bgColor}`}>
                  <Icon size={20} />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">{kpi.badge}</span>
                <span className="text-blue-600 flex items-center gap-0.5 font-medium">
                  Active <ArrowUpRight size={13} />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Secondary KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-3">
        {kpis.slice(4).map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div
              key={idx}
              className="p-4 rounded-xl bg-white border border-slate-200/70 shadow-sm flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg border ${kpi.bgColor}`}>
                  <Icon size={18} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium">{kpi.title}</p>
                  <p className="text-lg font-bold text-slate-800">{kpi.value}</p>
                </div>
              </div>
              <span className="text-xs text-slate-400 font-medium px-2 py-0.5 rounded bg-slate-50 border border-slate-100">
                {kpi.badge}
              </span>
            </div>
          );
        })}
      </div>

      {/* Pipeline Status Breakdown Section */}
      {data?.leadsByStatus && data.leadsByStatus.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-slate-900">Leads by Status Pipeline</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">Distribution of all active leads across sales stages</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md">
              <Layers size={14} className="text-slate-500" />
              <span>{data.leadsByStatus.length} Stages</span>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 pt-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {data.leadsByStatus.map((st) => {
                const styling = getStatusColor(st.statusName);
                const pct = totalLeads > 0 ? Math.round((st.count / totalLeads) * 100) : 0;
                return (
                  <div
                    key={st.statusId}
                    className={`p-4 rounded-xl border border-slate-200/80 bg-white hover:border-slate-300 transition-all shadow-sm`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${styling.bg} ${styling.text}`}>
                        {st.statusName}
                      </span>
                      <span className="text-xs font-bold text-slate-500">{pct}%</span>
                    </div>
                    <p className="text-2xl font-black text-slate-800">{st.count}</p>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${styling.bar}`}
                        style={{ width: `${Math.max(pct, 4)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Products & Sources Grid if available */}
      {((data?.leadsByProduct && data.leadsByProduct.length > 0) || 
        (data?.leadsBySource && data.leadsBySource.length > 0)) && (
        <div className="grid gap-6 md:grid-cols-2">
          {data?.leadsByProduct && data.leadsByProduct.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-bold text-slate-800">Leads by Product</CardTitle>
                <Layers size={16} className="text-slate-400" />
              </CardHeader>
              <CardContent className="space-y-3">
                {data.leadsByProduct.map((prod) => (
                  <div key={prod.productId} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0 text-sm">
                    <span className="font-medium text-slate-700">{prod.productName}</span>
                    <span className="font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md text-xs">{prod.count} leads</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {data?.leadsBySource && data.leadsBySource.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-bold text-slate-800">Leads by Acquisition Source</CardTitle>
                <Compass size={16} className="text-slate-400" />
              </CardHeader>
              <CardContent className="space-y-3">
                {data.leadsBySource.map((src) => (
                  <div key={src.sourceId} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-700">{src.sourceName}</span>
                      {src.isMarketing && (
                        <span className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded font-medium">Marketing</span>
                      )}
                    </div>
                    <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md text-xs">{src.count} leads</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
