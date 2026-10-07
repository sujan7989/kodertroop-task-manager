import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@apollo/client';
import { REGISTER_MUTATION } from '../graphql/auth';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { UserPlus, Eye, EyeOff, Loader2, CheckSquare, Check, X } from 'lucide-react';

interface RegisterForm {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface PasswordRule {
  label: string;
  test: (p: string) => boolean;
}

const passwordRules: PasswordRule[] = [
  { label: 'At least 8 characters',     test: (p) => p.length >= 8 },
  { label: 'One uppercase letter',       test: (p) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter',       test: (p) => /[a-z]/.test(p) },
  { label: 'One number',                 test: (p) => /[0-9]/.test(p) },
];

const Register: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { showToast } = useToast();
  const [formData, setFormData] = useState<RegisterForm>({
    name: '', email: '', password: '', confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [showRules, setShowRules] = useState(false);

  const [registerMutation, { loading }] = useMutation(REGISTER_MUTATION, {
    onCompleted: (data: { register: { token: string; user: { id: string; name: string; email: string; createdAt: string; updatedAt: string } } }) => {
      login(data.register.token, data.register.user);
      showToast('success', 'Account created! Welcome to KoderTroop 🎉');
      navigate('/dashboard');
    },
    onError: (err: { message?: string }) => {
      setError(err.message ?? 'Registration failed. Please try again.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    const failedRules = passwordRules.filter((r) => !r.test(formData.password));
    if (failedRules.length > 0) {
      setError(`Password must have: ${failedRules.map((r) => r.label.toLowerCase()).join(', ')}.`);
      return;
    }
    registerMutation({ variables: { input: { name: formData.name, email: formData.email, password: formData.password } } });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const passwordStrength = passwordRules.filter((r) => r.test(formData.password)).length;
  const strengthColors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500'];
  const strengthLabels = ['Weak', 'Fair', 'Good', 'Strong'];

  return (
    <div className="min-h-screen bg-mesh flex items-center justify-center px-4 py-8 relative overflow-hidden">
      {/* Animated background orbs */}
      <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-accent-purple/8 rounded-full blur-3xl animate-float pointer-events-none" />
      <div className="absolute bottom-1/3 left-1/4 w-80 h-80 bg-primary-500/8 rounded-full blur-3xl animate-float delay-400 pointer-events-none" />

      <div className="w-full max-w-md animate-fade-in-up relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-accent-purple to-primary-500 mb-5 shadow-glow-lg animate-pulse-glow">
            <CheckSquare className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold gradient-text mb-1">Join KoderTroop</h1>
          <p className="text-slate-400 text-sm">Free forever. No credit card required.</p>
        </div>

        {/* Card */}
        <div className="glass-strong rounded-3xl p-8 shadow-modal">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white mb-1">Create your account</h2>
            <p className="text-slate-400 text-sm">Start managing tasks like a pro</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm animate-fade-in-scale">
                <span className="mt-0.5 flex-shrink-0">⚠</span>
                <span>{error}</span>
              </div>
            )}

            {/* Name */}
            <div className="space-y-1.5">
              <label htmlFor="name" className="block text-sm font-medium text-slate-300">Full name</label>
              <input
                id="name" name="name" type="text" required autoComplete="name"
                value={formData.name} onChange={handleChange}
                className="w-full px-4 py-3 bg-surface-secondary border border-border rounded-xl focus:outline-none focus:border-primary-500 input-glow text-white placeholder-slate-500 transition-all duration-200"
                placeholder="John Doe"
              />
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium text-slate-300">Email address</label>
              <input
                id="email" name="email" type="email" required autoComplete="email"
                value={formData.email} onChange={handleChange}
                className="w-full px-4 py-3 bg-surface-secondary border border-border rounded-xl focus:outline-none focus:border-primary-500 input-glow text-white placeholder-slate-500 transition-all duration-200"
                placeholder="you@example.com"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-slate-300">Password</label>
              <div className="relative">
                <input
                  id="password" name="password" type={showPassword ? 'text' : 'password'} required
                  value={formData.password} onChange={handleChange}
                  onFocus={() => setShowRules(true)}
                  onBlur={() => setShowRules(false)}
                  className="w-full px-4 py-3 pr-12 bg-surface-secondary border border-border rounded-xl focus:outline-none focus:border-primary-500 input-glow text-white placeholder-slate-500 transition-all duration-200"
                  placeholder="Min 8 chars with A-z, 0-9"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors p-1">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Password strength */}
              {formData.password.length > 0 && (
                <div className="space-y-2 animate-fade-in-scale">
                  <div className="flex gap-1">
                    {[0,1,2,3].map((i) => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i < passwordStrength ? strengthColors[passwordStrength - 1] : 'bg-border'}`} />
                    ))}
                  </div>
                  {passwordStrength > 0 && (
                    <p className={`text-xs font-medium ${['text-red-400','text-orange-400','text-yellow-400','text-green-400'][passwordStrength-1]}`}>
                      {strengthLabels[passwordStrength - 1]} password
                    </p>
                  )}
                </div>
              )}

              {/* Password rules dropdown */}
              {showRules && formData.password.length > 0 && (
                <div className="bg-surface-secondary border border-border rounded-xl p-3 space-y-1.5 animate-fade-in-scale">
                  {passwordRules.map((rule) => {
                    const passed = rule.test(formData.password);
                    return (
                      <div key={rule.label} className={`flex items-center gap-2 text-xs transition-colors ${passed ? 'text-green-400' : 'text-slate-500'}`}>
                        {passed ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        {rule.label}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-1.5">
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300">Confirm password</label>
              <div className="relative">
                <input
                  id="confirmPassword" name="confirmPassword"
                  type={showConfirm ? 'text' : 'password'} required
                  value={formData.confirmPassword} onChange={handleChange}
                  className={`w-full px-4 py-3 pr-12 bg-surface-secondary border rounded-xl focus:outline-none input-glow text-white placeholder-slate-500 transition-all duration-200 ${
                    formData.confirmPassword && formData.password !== formData.confirmPassword
                      ? 'border-red-500/50 focus:border-red-500'
                      : formData.confirmPassword && formData.password === formData.confirmPassword
                      ? 'border-green-500/50 focus:border-green-500'
                      : 'border-border focus:border-primary-500'
                  }`}
                  placeholder="Repeat your password"
                />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors p-1">
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                <p className="text-xs text-red-400">Passwords do not match</p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit" disabled={loading}
              className="w-full relative overflow-hidden bg-gradient-to-r from-primary-600 to-accent-purple hover:from-primary-500 hover:to-accent-purple text-white font-semibold py-3.5 px-4 rounded-xl transition-all duration-300 flex items-center justify-center gap-2.5 disabled:opacity-60 disabled:cursor-not-allowed shadow-glow hover:shadow-glow-lg hover:-translate-y-0.5 active:translate-y-0 mt-2"
            >
              {loading ? (
                <><Loader2 className="w-5 h-5 animate-spin" /><span>Creating account...</span></>
              ) : (
                <><UserPlus className="w-5 h-5" /><span>Create Account</span></>
              )}
            </button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-border" />
            <span className="text-slate-600 text-xs">OR</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <p className="text-center text-sm text-slate-400">
            Already have an account?{' '}
            <Link to="/login" className="text-primary-400 hover:text-primary-300 font-semibold transition-colors hover:underline underline-offset-2">
              Sign in →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;
