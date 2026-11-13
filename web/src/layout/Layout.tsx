import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Home, Users, Building, Calendar, LogOut } from 'lucide-react';

const links = [
  { to: '/dashboard', label: 'Dashboard', icon: <Home size={18} /> },
  { to: '/leads', label: 'Leads', icon: <Users size={18} /> },
  { to: '/companies', label: 'Companies', icon: <Building size={18} /> },
  { to: '/tasks', label: 'Tasks', icon: <Calendar size={18} /> },
];

export default function Layout() {
  return (
    <div className="flex h-full">
      <nav className="w-64 bg-white border-r p-4 flex flex-col">
        <h1 className="text-xl font-semibold mb-6">LI CRM</h1>
        <ul className="space-y-2">
          {links.map((l) => (
            <li key={l.to}>
              <NavLink
                to={l.to}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded px-3 py-2 ${
                    isActive ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100'
                  }`
                }
              >
                {l.icon}
                {l.label}
              </NavLink>
            </li>
          ))}
        </ul>
        <button className="mt-auto flex items-center gap-2 text-red-600 hover:text-red-800">
          <LogOut size={18} />
          Logout (TODO)
        </button>
      </nav>
      <main className="flex-1 overflow-y-auto p-6 bg-gray-50">
        <Outlet />
      </main>
    </div>
  );
}

