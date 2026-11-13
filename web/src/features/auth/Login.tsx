import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/shared/auth/AuthContext';
import { Briefcase, Lock, Mail, ArrowRight, ShieldCheck } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().email({ message: 'Valid business email is required' }),
  password: z.string().min(1, { message: 'Password is required' }),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname || '/dashboard';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
    setValue,
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    try {
      await login(data.email, data.password);
      navigate(from, { replace: true });
    } catch (e: any) {
      if (e.code === 'INVALID_CREDENTIALS') {
        setError('email', { type: 'server', message: 'Invalid credentials. Check email or password.' });
        setError('password', { type: 'server', message: 'Invalid credentials. Check email or password.' });
      } else if (e.message) {
        setError('email', { type: 'server', message: e.message });
      }
    }
  };

  const fillDemoAdmin = () => {
    setValue('email', 'admin@licrm.example');
    setValue('password', 'Admin@12345');
  };

  return (
    <div className="min-h-screen w-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-4 font-sans antialiased relative overflow-hidden">
      {/* Decorative background glow circles */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl shadow-black/40 border border-slate-100 overflow-hidden relative z-10">
        {/* Top Header */}
        <div className="pt-8 pb-6 px-8 text-center bg-gradient-to-b from-slate-50 to-white border-b border-slate-100">
          <div className="inline-flex h-12 w-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 items-center justify-center text-white shadow-lg shadow-blue-500/30 mb-3">
            <Briefcase size={24} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">LI CRM Portal</h1>
          <p className="text-xs text-slate-500 mt-1">Lead Intelligence & Sales Management</p>
        </div>

        {/* Form Body */}
        <div className="p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5" htmlFor="email">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail size={16} />
                </div>
                <input
                  id="email"
                  type="email"
                  placeholder="name@company.com"
                  className="w-full pl-9 pr-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-slate-50/50 hover:bg-white"
                  {...register('email')}
                />
              </div>
              {errors.email && (
                <p className="text-xs text-rose-500 font-medium mt-1.5">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock size={16} />
                </div>
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••••••"
                  className="w-full pl-9 pr-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-slate-50/50 hover:bg-white"
                  {...register('password')}
                />
              </div>
              {errors.password && (
                <p className="text-xs text-rose-500 font-medium mt-1.5">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-xl shadow-lg shadow-blue-500/25 transition-all duration-200 flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <span>Signing in...</span>
              ) : (
                <>
                  <span>Sign In to Dashboard</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Fill Pill */}
          <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <ShieldCheck size={14} className="text-emerald-500" /> Demo Account:
            </span>
            <button
              type="button"
              onClick={fillDemoAdmin}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100/80 px-2.5 py-1 rounded-lg transition"
            >
              Fill Admin Credentials
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
