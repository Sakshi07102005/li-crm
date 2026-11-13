// src/features/companies/Companies.tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/shared/api/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/ui/Card';
import { Plus, X } from 'lucide-react';

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
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    industry: '',
    location: '',
    website: '',
    size: '11-50',
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const res = await api.get('/companies');
      return res.data.data ?? res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: typeof formData) => {
      const res = await api.post('/companies', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      setIsAddOpen(false);
      setFormError(null);
      setFormData({
        name: '',
        industry: '',
        location: '',
        website: '',
        size: '11-50',
      });
    },
    onError: (err: any) => {
      setFormError(err.response?.data?.message || 'Failed to create company');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!formData.name.trim()) {
      setFormError('Company name is required');
      return;
    }
    createMutation.mutate(formData);
  };

  if (isLoading) return <div className="text-gray-500 p-8">Loading companies…</div>;
  if (isError) return <div className="text-red-600 p-8">Failed to load companies.</div>;

  const companies: Company[] = data?.companies ?? (Array.isArray(data) ? data : []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-800">Companies</h1>
          <span className="text-sm font-medium text-gray-500 bg-gray-200 px-3 py-1 rounded-full">
            Total: {data?.meta?.total ?? companies.length}
          </span>
        </div>
        <button
          onClick={() => setIsAddOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg shadow hover:bg-blue-700 transition"
        >
          <Plus size={16} />
          Add Company
        </button>
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
                {company.website && (
                  <p className="text-blue-600 truncate text-xs hover:underline">
                    🌐 {company.website}
                  </p>
                )}
                <div className="pt-2 flex items-center justify-between border-t border-gray-100 mt-2 text-xs text-gray-500">
                  <span>Contacts: <strong className="text-gray-700">{company.contactCount ?? 0}</strong></span>
                  <span>Leads: <strong className="text-gray-700">{company.leadCount ?? 0}</strong></span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Company Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between pb-3 border-b">
              <h2 className="text-base font-bold text-gray-800">Add New Company</h2>
              <button onClick={() => setIsAddOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3 pt-3 text-sm">
              {formError && (
                <div className="p-2 text-xs bg-red-50 text-red-700 border border-red-200 rounded">
                  {formError}
                </div>
              )}
              <div>
                <label className="block text-gray-700 font-medium text-xs mb-1">
                  Company Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acme Health Corp"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded outline-none"
                />
              </div>
              <div>
                <label className="block text-gray-700 font-medium text-xs mb-1">Industry</label>
                <input
                  type="text"
                  placeholder="e.g. Healthcare, IT, Education"
                  value={formData.industry}
                  onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-700 font-medium text-xs mb-1">Location</label>
                  <input
                    type="text"
                    placeholder="e.g. Mumbai, India"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="w-full px-3 py-1.5 border rounded outline-none"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-medium text-xs mb-1">Size</label>
                  <select
                    value={formData.size}
                    onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                    className="w-full px-3 py-1.5 border rounded outline-none bg-white"
                  >
                    <option value="1-10">1-10</option>
                    <option value="11-50">11-50</option>
                    <option value="51-200">51-200</option>
                    <option value="201-500">201-500</option>
                    <option value="500+">500+</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-gray-700 font-medium text-xs mb-1">Website</label>
                <input
                  type="text"
                  placeholder="e.g. https://acmehealth.example"
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-3 py-1.5 border rounded text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-1.5 bg-blue-600 text-white rounded text-xs font-semibold disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating…' : 'Create Company'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
