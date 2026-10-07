import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@apollo/client';
import { LOGIN_MUTATION } from '../graphql/auth';
import { LoginInput } from '../types/auth';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { LogIn, Eye, EyeOff, Loader2, CheckSquare, Sparkles } from 'lucide-react';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { showToast } = useToast();
  const [formData, setFormData] = useState<LoginInput>({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const [loginMutation, { loading }] = useMutation(LOGIN_MUTATION, {
    onCompleted: (data: { login: { token: string; user: { id: string; name: string; email: string; createdAt: string; updatedAt: string } } }) => {
      login(data.login.token, data.login.user);
      showToast('success', `Welcome back, ${data.login.user.name}!`);
      navigate('/dashboard');
    },
    onError: (err: { message?: string }) => {
      setError(err.message ?? 'Login failed. Please try again.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    loginMutation({ variables: { input: formData } });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <div className="min-h-screen bg-mesh flex items-center justify-center px-4 relative overflow-hidden">
      {/* Animated background orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl animate-float pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent-purple/8 rounded-full blur-3xl animate-float delay-300 pointer-events-none" />
      <div className="absolute top-3/4 left-1/2 w-64 h-64 bg-accent-cyan/6 rounded-full blur-3xl animate-float delay-200 pointer-events-none" />

      <div className="w-full max-w-md animate-fade-in-up relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-primary-500 to-accent-purple mb-5 shadow-glow-lg animate-pulse-glow">
            <CheckSquare className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold gradient-text mb-2">KoderTroop</h1>
          <p className="text-slate-400 text-sm flex items-center justify-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-primary-400" />
            Smart task management for developers
          </p>
        </div>

        {/* Card */}
        <div className="glass-strong rounded-3xl p-8 shadow-modal">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white mb-1">Welcome back</h2>
            <p className="text-slate-400 text-sm">Sign in to continue to your workspace</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm animate-fade-in-scale">
                <span className="mt-0.5">⚠</span>
                <span>{error}</span>
              </div>
            )}

            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium text-slate-300">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-surface-secondary border border-border rounded-xl focus:outline-none focus:border-primary-500 input-glow text-white placeholder-slate-500 transition-all duration-200"
                placeholder="you@example.com"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-slate-300">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={formData.password}
                  onChange={handleChange}
                  className="w-full px-4 py-3 pr-12 bg-surface-secondary border border-border rounded-xl focus:outline-none focus:border-primary-500 input-glow text-white placeholder-slate-500 transition-all duration-200"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors p-1"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full relative overflow-hidden bg-gradient-to-r from-primary-600 to-accent-purple hover:from-primary-500 hover:to-accent-purple text-white font-semibold py-3.5 px-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-2.5 disabled:opacity-60 disabled:cursor-not-allowed shadow-glow hover:shadow-glow-lg hover:-translate-y-0.5 active:translate-y-0 mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  <span>Sign In</span>
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-border" />
            <span className="text-slate-600 text-xs">OR</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <p className="text-center text-sm text-slate-400">
            Don't have an account?{' '}
            <Link
              to="/register"
              className="text-primary-400 hover:text-primary-300 font-semibold transition-colors hover:underline underline-offset-2"
            >
              Create one free →
            </Link>
          </p>
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          Secured with JWT authentication
        </p>
      </div>
    </div>
  );
};

export default Login;
