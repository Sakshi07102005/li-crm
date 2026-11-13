// src/features/tasks/Tasks.tsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/shared/api/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/ui/Card';
import { 
  Plus, 
  CheckCircle, 
  Clock, 
  X, 
  Calendar, 
  User, 
  AlertCircle, 
  CheckSquare, 
  Flame,
  Search
} from 'lucide-react';

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
  const [searchQuery, setSearchQuery] = useState('');
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
        <h3 className="font-semibold text-base">Failed to load tasks</h3>
        <p className="text-sm mt-1">Please ensure backend services are active.</p>
      </div>
    );
  }

  const tasks: Task[] = data?.tasks ?? (Array.isArray(data) ? data : []);

  const filteredTasks = tasks.filter((t) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = t.title.toLowerCase().includes(q);
      const matchLead = t.lead?.leadName?.toLowerCase().includes(q);
      if (!matchTitle && !matchLead) return false;
    }
    if (filter === 'all') return true;
    if (filter === 'overdue') return t.isOverdue && t.status !== 'completed';
    return t.status === filter;
  });

  const overdueCount = tasks.filter((t) => t.isOverdue && t.status !== 'completed').length;

  const getStatusBadge = (status: string, isOverdue: boolean) => {
    if (status === 'completed') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
          <CheckCircle size={12} />
          Completed
        </span>
      );
    }
    if (isOverdue) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200/60 animate-pulse">
          <AlertCircle size={12} />
          Overdue
        </span>
      );
    }
    if (status === 'in_progress') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200/60">
          <Clock size={12} />
          In Progress
        </span>
      );
    }
    if (status === 'cancelled') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
          Cancelled
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/60">
        Pending
      </span>
    );
  };

  const getPriorityAccent = (priority: string) => {
    switch (priority) {
      case 'high':
        return {
          border: 'border-l-4 border-l-rose-500',
          badge: (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md">
              <Flame size={12} /> High Priority
            </span>
          ),
        };
      case 'low':
        return {
          border: 'border-l-4 border-l-slate-300',
          badge: <span className="text-[11px] font-medium text-slate-500">Low Priority</span>,
        };
      default:
        return {
          border: 'border-l-4 border-l-blue-500',
          badge: (
            <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
              Medium Priority
            </span>
          ),
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Tasks & Activities</h1>
            <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200/60 px-2.5 py-0.5 rounded-full">
              {tasks.length} Total
            </span>
            {overdueCount > 0 && (
              <span className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200/60 px-2.5 py-0.5 rounded-full">
                {overdueCount} Overdue
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-0.5">Manage follow-ups, calls, reminders, and client deliverables</p>
        </div>

        <button
          onClick={() => setIsAddOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-md shadow-blue-500/20 transition-all duration-200"
        >
          <Plus size={16} />
          <span>Add Task</span>
        </button>
      </div>

      {/* Filter Tabs and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 bg-slate-200/60 rounded-xl max-w-fit">
          {[
            { id: 'all', label: 'All Tasks' },
            { id: 'pending', label: 'Pending' },
            { id: 'in_progress', label: 'In Progress' },
            { id: 'completed', label: 'Completed' },
            { id: 'overdue', label: 'Overdue' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                filter === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
              {tab.id === 'overdue' && overdueCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-700 text-[10px]">
                  {overdueCount}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="relative max-w-xs">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search size={15} />
          </div>
          <input
            type="text"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3.5 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm"
          />
        </div>
      </div>

      {/* Task Cards Grid */}
      {filteredTasks.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200/80 rounded-2xl shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-3">
            <CheckSquare size={24} />
          </div>
          <h3 className="text-sm font-semibold text-slate-800">No tasks in this view</h3>
          <p className="text-xs text-slate-500 mt-1">All caught up or try switching filter tabs.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTasks.map((task) => {
            const { border, badge } = getPriorityAccent(task.priority);
            return (
              <Card
                key={task.id}
                className={`hover:shadow-md transition-all flex flex-col justify-between ${border}`}
              >
                <div>
                  <CardHeader className="flex flex-row items-start justify-between pb-2.5">
                    <CardTitle className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">
                      {task.title}
                    </CardTitle>
                    {getStatusBadge(task.status, task.isOverdue)}
                  </CardHeader>

                  <CardContent className="space-y-3 pt-2 text-xs">
                    {task.description && (
                      <p className="text-slate-600 line-clamp-2 leading-relaxed">
                        {task.description}
                      </p>
                    )}

                    {task.lead && (
                      <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 text-slate-700 font-medium flex items-center gap-2">
                        <span className="text-blue-600 font-semibold text-[11px]">Lead:</span>
                        <span className="truncate">{task.lead.leadName}</span>
                        <span className="text-[10px] text-slate-400 font-mono">({task.lead.leadCode})</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs pt-1">
                      {badge}
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <Calendar size={13} className={task.isOverdue ? 'text-rose-500' : 'text-slate-400'} />
                        <span className={task.isOverdue && task.status !== 'completed' ? 'text-rose-600 font-semibold' : ''}>
                          {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </div>

                {/* Card Footer with Assignee & Quick Actions */}
                <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 rounded-b-xl flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <User size={13} className="text-slate-400" />
                    <span className="truncate max-w-[120px] font-medium text-slate-700">
                      {task.assignedTo?.name ?? 'Unassigned'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {task.status !== 'completed' && (
                      <button
                        onClick={() => statusMutation.mutate({ id: task.id, status: 'completed' })}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-lg hover:bg-emerald-100 transition text-[11px] font-semibold"
                      >
                        <CheckCircle size={12} />
                        Done
                      </button>
                    )}

                    {task.status === 'pending' && (
                      <button
                        onClick={() => statusMutation.mutate({ id: task.id, status: 'in_progress' })}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200/80 rounded-lg hover:bg-amber-100 transition text-[11px] font-semibold"
                      >
                        <Clock size={12} />
                        Start
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Task Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-100 text-blue-600">
                  <CheckSquare size={18} />
                </div>
                <h2 className="text-base font-bold text-slate-900">Create New Task</h2>
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
                  Task Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Schedule product demo with stakeholders"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Description / Agenda
                </label>
                <textarea
                  rows={3}
                  placeholder="Key deliverables, meeting link, action items..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Priority
                  </label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition bg-white text-sm"
                  >
                    <option value="high">High Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="low">Low Priority</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition bg-white text-sm"
                  />
                </div>
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
                  {createMutation.isPending ? 'Creating...' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
