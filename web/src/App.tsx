import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from '@/layout/Layout';
import Dashboard from '@/features/dashboard/Dashboard';
import LeadsList from '@/features/leads/LeadsList';
import LeadDetail from '@/features/leads/LeadDetail';
import Companies from '@/features/companies/Companies';
import Tasks from '@/features/tasks/Tasks';
import Reports from '@/features/reports/Reports';
import NotFound from '@/ui/NotFound';
import Forbidden from '@/ui/Forbidden';
import Login from '@/features/auth/Login';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('accessToken');
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/leads" element={<LeadsList />} />
        <Route path="/leads/:id" element={<LeadDetail />} />
        <Route path="/companies" element={<Companies />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/403" element={<Forbidden />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

