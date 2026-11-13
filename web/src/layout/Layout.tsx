import { NavLink, Outlet } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/shared/auth/AuthContext';

const links = [
  { to: '/', label: 'Dashboard', icon: <span>🏠</span> },
  { to: '/leads', label: 'Leads', icon: <span>📋</span> },
  { to: '/companies', label: 'Companies', icon: <span>🏢</span> },
  { to: '/tasks', label: 'Tasks', icon: <span>✅</span> },
];

export default function Layout() {
  const { logout } = useAuth();
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
        <button
          className="mt-auto flex items-center gap-2 text-red-600 hover:text-red-800"
          onClick={logout}
        >
          <LogOut size={18} />
          Logout
        </button>
      </nav>
      <main className="flex-1 overflow-y-auto p-6 bg-gray-50">
        <Outlet />
      </main>
    </div>
  );
}
