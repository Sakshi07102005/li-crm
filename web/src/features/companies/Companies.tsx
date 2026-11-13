// src/features/companies/Companies.tsx
import { useQuery } from '@tanstack/react-query';
import api from '@/shared/api/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/ui/Card';

interface Company {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  size: string | null;
  location: string | null;
  contactCount: number;
  leadCount: number;
  createdAt: string;
}

export default function Companies() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const res = await api.get('/companies');
      return res.data.data ?? res.data;
    },
  });

  if (isLoading) return <div className="text-gray-500 p-8">Loading companies…</div>;
  if (isError) return <div className="text-red-600 p-8">Failed to load companies.</div>;

  const companies: Company[] = data?.companies ?? (Array.isArray(data) ? data : []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Companies</h1>
        <span className="text-sm font-medium text-gray-500 bg-gray-200 px-3 py-1 rounded-full">
          Total: {data?.meta?.total ?? companies.length}
        </span>
      </div>

      {companies.length === 0 ? (
        <p className="text-gray-500">No companies found.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {companies.map((company) => (
            <Card key={company.id} className="hover:shadow-md transition">
              <CardHeader className="flex justify-between items-start pb-2">
                <CardTitle className="text-base font-semibold text-gray-900">
                  {company.name}
                </CardTitle>
                {company.industry && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded bg-purple-100 text-purple-700">
                    {company.industry}
                  </span>
                )}
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {company.location && (
                  <p className="text-gray-600">📍 {company.location}</p>
                )}
                {company.size && (
                  <p className="text-gray-600">👥 {company.size} employees</p>
                )}
                {company.website && (
                  <p className="truncate">
                    🌐{' '}
                    <a
                      href={company.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {company.website.replace(/^https?:\/\//, '')}
                    </a>
                  </p>
                )}
                <div className="pt-2 flex items-center justify-between border-t border-gray-100 text-xs text-gray-500 mt-2">
                  <span>Contacts: <strong className="text-gray-700">{company.contactCount ?? 0}</strong></span>
                  <span>Leads: <strong className="text-gray-700">{company.leadCount ?? 0}</strong></span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
