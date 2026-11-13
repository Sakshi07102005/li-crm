// src/features/leads/LeadsList.tsx
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/shared/api/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/ui/Card';
import { Link } from 'react-router-dom';

export default function LeadsList() {
  const { data, isLoading, isError } = useQuery(['leads'], async () => {
    const res = await api.get('/leads');
    return res.data;
  });

  if (isLoading) return <div className="text-gray-500">Loading leads…</div>;
  if (isError) return <div className="text-red-600">Failed to load leads.</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold mb-4">Leads</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data?.leads?.map((lead: any) => (
          <Card key={lead.id}>
            <CardHeader>
              <CardTitle>{lead.email || lead.mobile}</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Status: {lead.status}</p>
              <p>Priority: {lead.priority}</p>
              <Link to={`/leads/${lead.id}`} className="text-primary underline mt-2 inline-block">
                View details
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

