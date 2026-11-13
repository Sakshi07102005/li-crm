// src/features/tasks/Tasks.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/shared/api/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/ui/Card';

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high';
  dueDate: string;
  isOverdue: boolean;
  lead?: {
    id: string;
    leadCode: string;
    leadName: string;
  } | null;
  assignedTo?: {
    id: string;
    name: string;
  } | null;
  assignedBy?: {
    id: string;
    name: string;
  } | null;
}

export default function Tasks() {
  const [filter, setFilter] = useState<string>('all');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const res = await api.get('/tasks');
      return res.data.data ?? res.data;
    },
  });

  if (isLoading) return <div className="text-gray-500 p-8">Loading tasks…</div>;
  if (isError) return <div className="text-red-600 p-8">Failed to load tasks.</div>;

  const tasks: Task[] = data?.tasks ?? (Array.isArray(data) ? data : []);

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'all') return true;
    if (filter === 'overdue') return t.isOverdue && t.status !== 'completed';
    return t.status === filter;
  });

  const getStatusBadge = (status: string, isOverdue: boolean) => {
    if (status === 'completed') {
      return <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-green-100 text-green-800">Completed</span>;
    }
    if (isOverdue) {
      return <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-red-100 text-red-800">Overdue</span>;
    }
    if (status === 'in_progress') {
      return <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-amber-100 text-amber-800">In Progress</span>;
    }
    if (status === 'cancelled') {
      return <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-gray-100 text-gray-600">Cancelled</span>;
    }
    return <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-blue-100 text-blue-800">Pending</span>;
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high':
        return <span className="text-xs font-medium text-red-600">⚡ High Priority</span>;
      case 'low':
        return <span className="text-xs font-medium text-gray-500">Low Priority</span>;
      default:
        return <span className="text-xs font-medium text-blue-600">Medium Priority</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Tasks</h1>
          <p className="text-sm text-gray-500">Manage follow-ups, calls, and customer activities</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {['all', 'pending', 'in_progress', 'completed', 'overdue'].map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1 text-xs font-medium rounded capitalize transition ${
                filter === tab
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {filteredTasks.length === 0 ? (
        <p className="text-gray-500 p-4">No tasks found for this view.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTasks.map((task) => (
            <Card key={task.id} className="hover:shadow-md transition">
              <CardHeader className="flex justify-between items-start pb-2">
                <CardTitle className="text-sm font-semibold text-gray-900 leading-tight">
                  {task.title}
                </CardTitle>
                {getStatusBadge(task.status, task.isOverdue)}
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {task.description && (
                  <p className="text-gray-600 line-clamp-2">{task.description}</p>
                )}
                {task.lead && (
                  <p className="text-gray-700 font-medium">
                    👤 Lead: {task.lead.leadName} ({task.lead.leadCode})
                  </p>
                )}
                <div className="flex items-center justify-between pt-2 border-t border-gray-100 mt-2">
                  {getPriorityBadge(task.priority)}
                  <span className="text-gray-500">
                    Due: {new Date(task.dueDate).toLocaleDateString()}
                  </span>
                </div>
                <div className="text-gray-500 text-[11px] pt-1">
                  Assignee: <strong className="text-gray-700">{task.assignedTo?.name ?? 'Unassigned'}</strong>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
