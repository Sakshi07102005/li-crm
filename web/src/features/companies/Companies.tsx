// src/features/companies/Companies.tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/shared/api/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/ui/Card';
import { 
  Building2, 
  Plus, 
  X, 
  MapPin, 
  Globe, 
  Users, 
  Briefcase, 
  Search
} from 'lucide-react';

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
  const [searchQuery, setSearchQuery] = useState('');

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

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-slate-200 rounded-lg w-48" />
        <div className="grid gap-5 md:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-44 bg-slate-200 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 rounded-xl bg-rose-50 border border-rose-200 text-rose-700">
        <h3 className="font-semibold text-base">Failed to load companies directory</h3>
        <p className="text-sm mt-1">Please ensure backend services are active.</p>
      </div>
    );
  }

  const companies: Company[] = data?.companies ?? (Array.isArray(data) ? data : []);

  const filteredCompanies = companies.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.industry && c.industry.toLowerCase().includes(q)) ||
      (c.location && c.location.toLowerCase().includes(q))
    );
  });

  const getCompanyAvatarColor = (name: string) => {
    const colors = [
      'from-blue-600 to-indigo-600 text-white',
      'from-purple-600 to-pink-600 text-white',
      'from-emerald-600 to-teal-600 text-white',
      'from-amber-500 to-orange-600 text-white',
      'from-cyan-600 to-blue-600 text-white',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Companies</h1>
            <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200/60 px-2.5 py-0.5 rounded-full">
              {companies.length} Records
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">Corporate accounts, industries, and associated contacts</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsAddOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-500/20 transition-all duration-200"
          >
            <Plus size={16} />
            <span>Add Company</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
          <Search size={16} />
        </div>
        <input
          type="text"
          placeholder="Search by company name, industry, or location..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
        />
      </div>

      {/* Companies Grid */}
      {filteredCompanies.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200/80 rounded-2xl shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-3">
            <Building2 size={24} />
          </div>
          <h3 className="text-sm font-semibold text-slate-800">No companies found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {searchQuery ? 'Try adjusting your search criteria.' : 'Get started by creating your first company profile.'}
          </p>
          {!searchQuery && (
            <button
              onClick={() => setIsAddOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition"
            >
              <Plus size={14} /> Add Company
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filteredCompanies.map((company) => (
            <Card key={company.id} className="hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200 flex flex-col justify-between">
              <div>
                <CardHeader className="flex flex-row items-start justify-between pb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${getCompanyAvatarColor(company.name)} flex items-center justify-center font-bold text-base shadow-sm`}>
                      {company.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <CardTitle className="text-base font-bold text-slate-900 leading-snug line-clamp-1">
                        {company.name}
                      </CardTitle>
                      {company.size && (
                        <span className="text-[11px] text-slate-400 font-medium">
                          {company.size} employees
                        </span>
                      )}
                    </div>
                  </div>

                  {company.industry && (
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100/80">
                      {company.industry}
                    </span>
                  )}
                </CardHeader>

                <CardContent className="space-y-2.5 pt-3">
                  {company.location && (
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <MapPin size={14} className="text-slate-400 flex-shrink-0" />
                      <span className="truncate">{company.location}</span>
                    </div>
                  )}

                  {company.website ? (
                    <div className="flex items-center gap-2 text-xs text-blue-600">
                      <Globe size={14} className="text-slate-400 flex-shrink-0" />
                      <a
                        href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate hover:underline"
                      >
                        {company.website.replace(/^https?:\/\//, '')}
                      </a>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-slate-400 italic">
                      <Globe size={14} className="text-slate-300 flex-shrink-0" />
                      <span>No website listed</span>
                    </div>
                  )}
                </CardContent>
              </div>

              {/* Card Footer */}
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 rounded-b-xl flex items-center justify-between text-xs font-medium text-slate-500">
                <div className="flex items-center gap-1.5">
                  <Users size={14} className="text-slate-400" />
                  <span>Contacts: <strong className="text-slate-700 font-semibold">{company.contactCount ?? 0}</strong></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Briefcase size={14} className="text-slate-400" />
                  <span>Leads: <strong className="text-slate-700 font-semibold">{company.leadCount ?? 0}</strong></span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add Company Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-100 text-blue-600">
                  <Building2 size={18} />
                </div>
                <h2 className="text-base font-bold text-slate-900">Add New Company</h2>
              </div>
              <button
                onClick={() => setIsAddOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4 text-sm">
              {formError && (
                <div className="p-3 text-xs bg-rose-50 text-rose-700 border border-rose-200 rounded-xl">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Company Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Health Technologies"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Industry
                </label>
                <input
                  type="text"
                  placeholder="e.g. SaaS, Healthcare, Financial Services"
                  value={formData.industry}
                  onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Location
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. New York, USA"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Company Size
                  </label>
                  <select
                    value={formData.size}
                    onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition bg-white text-sm"
                  >
                    <option value="1-10">1-10 employees</option>
                    <option value="11-50">11-50 employees</option>
                    <option value="51-200">51-200 employees</option>
                    <option value="201-500">201-500 employees</option>
                    <option value="500+">500+ employees</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Website URL
                </label>
                <input
                  type="text"
                  placeholder="e.g. https://apexhealth.example"
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition text-sm"
                />
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-500/20 transition disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Company'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
