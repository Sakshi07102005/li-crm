// src/features/tasks/Tasks.tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/shared/api/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/ui/Card';
import { Plus, CheckCircle, Clock, X } from 'lucide-react';

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
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>('all');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'medium',
    dueDate: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const res = await api.get('/tasks');
      return res.data.data ?? res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: typeof formData) => {
      const res = await api.post('/tasks', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setIsAddOpen(false);
      setFormError(null);
      setFormData({
        title: '',
        description: '',
        priority: 'medium',
        dueDate: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
      });
    },
    onError: (err: any) => {
      setFormError(err.response?.data?.message || 'Failed to create task');
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await api.patch(`/tasks/${id}/status`, { status });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!formData.title.trim()) {
      setFormError('Task title is required');
      return;
    }
    createMutation.mutate(formData);
  };

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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAddOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg shadow hover:bg-blue-700 transition"
          >
            <Plus size={15} />
            Add Task
          </button>
          <div className="flex gap-1 flex-wrap">
            {['all', 'pending', 'in_progress', 'completed', 'overdue'].map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`px-2.5 py-1 text-xs font-medium rounded capitalize transition ${
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

                {/* Quick Status Action Buttons */}
                <div className="pt-2 border-t flex items-center justify-end gap-1.5">
                  {task.status !== 'completed' && (
                    <button
                      onClick={() => statusMutation.mutate({ id: task.id, status: 'completed' })}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100 transition text-[11px] font-medium"
                    >
                      <CheckCircle size={12} />
                      Complete
                    </button>
                  )}
                  {task.status === 'pending' && (
                    <button
                      onClick={() => statusMutation.mutate({ id: task.id, status: 'in_progress' })}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded hover:bg-amber-100 transition text-[11px] font-medium"
                    >
                      <Clock size={12} />
                      Start
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Task Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-center justify-between pb-3 border-b">
              <h2 className="text-base font-bold text-gray-800">Create New Task</h2>
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
                  Task Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Call client for contract review"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded outline-none"
                />
              </div>
              <div>
                <label className="block text-gray-700 font-medium text-xs mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Key discussion points, agenda..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-1.5 border rounded outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-700 font-medium text-xs mb-1">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full px-3 py-1.5 border rounded outline-none bg-white"
                  >
                    <option value="high">High Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="low">Low Priority</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-700 font-medium text-xs mb-1">Due Date</label>
                  <input
                    type="date"
                    required
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="w-full px-3 py-1.5 border rounded outline-none bg-white"
                  >
                  </input>
                </div>
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
                  {createMutation.isPending ? 'Creating…' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
