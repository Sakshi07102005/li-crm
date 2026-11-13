// src/features/leads/LeadDetail.tsx
import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '@/shared/api/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/ui/Card';

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useQuery(['lead', id], async () => {
    const res = await api.get(`/leads/${id}`);
    return res.data;
  }, { enabled: !!id });

  if (isLoading) return <div className="text-gray-500">Loading lead…</div>;
  if (isError) return <div className="text-red-600">Failed to load lead.</div>;

  const lead = data?.lead || data;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{lead.email || lead.mobile}</CardTitle>
      </CardHeader>
      <CardContent>
        <p>Status: {lead.status}</p>
        <p>Priority: {lead.priority}</p>
        <p>Created at: {new Date(lead.created_at).toLocaleString()}</p>
        {/* Add more fields as needed */}
      </CardContent>
    </Card>
  );
}

