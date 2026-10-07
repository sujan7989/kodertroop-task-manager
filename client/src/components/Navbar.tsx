import React, { useState } from 'react';
import { LogOut, Menu, X, CheckSquare, Zap, BarChart2 } from 'lucide-react';

interface NavbarProps {
  userName: string;
  activeCount: number;
  completedCount: number;
  totalCount: number;
  onLogout: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ userName, activeCount, completedCount, totalCount, onLogout }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const completionPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const initials = userName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border/50 bg-surface/80 backdrop-blur-xl">
        {/* Progress bar at top */}
        <div className="h-0.5 bg-border">
          <div
            className="h-full bg-gradient-to-r from-primary-500 to-accent-purple transition-all duration-700 ease-out"
            style={{ width: `${completionPct}%` }}
          />
        </div>

        <div className="container mx-auto px-4 lg:px-6 max-w-7xl">
          <div className="flex items-center justify-between h-16">

            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-accent-purple flex items-center justify-center shadow-glow-sm">
                <CheckSquare className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold gradient-text hidden sm:block">KoderTroop</span>
            </div>

            {/* Desktop stats */}
            <div className="hidden lg:flex items-center gap-1 bg-surface-secondary border border-border rounded-2xl px-2 py-1.5">
              <StatChip icon={<Zap className="w-3.5 h-3.5 text-primary-400" />} value={activeCount} label="active" color="text-primary-400" />
              <div className="w-px h-4 bg-border mx-1" />
              <StatChip icon={<CheckSquare className="w-3.5 h-3.5 text-green-400" />} value={completedCount} label="done" color="text-green-400" />
              <div className="w-px h-4 bg-border mx-1" />
              <StatChip icon={<BarChart2 className="w-3.5 h-3.5 text-slate-400" />} value={totalCount} label="total" color="text-slate-300" />
              {totalCount > 0 && (
                <>
                  <div className="w-px h-4 bg-border mx-1" />
                  <span className="text-xs font-semibold text-accent-cyan px-2">{completionPct}%</span>
                </>
              )}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-3">
              {/* User avatar + name */}
              <div className="hidden sm:flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-accent-purple flex items-center justify-center text-white text-xs font-bold">
                  {initials}
                </div>
                <span className="text-sm font-medium text-slate-300">{userName}</span>
              </div>

              {/* Logout */}
              <button
                onClick={onLogout}
                className="hidden sm:flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-surface-elevated rounded-xl transition-all duration-200 border border-transparent hover:border-border"
                aria-label="Logout"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden lg:inline">Logout</span>
              </button>

              {/* Mobile menu toggle */}
              <button
                onClick={() => setMobileOpen((v) => !v)}
                className="lg:hidden p-2 text-slate-400 hover:text-white hover:bg-surface-elevated rounded-xl transition-all"
                aria-label="Toggle menu"
              >
                {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile dropdown */}
        {mobileOpen && (
          <div className="lg:hidden border-t border-border bg-surface-secondary animate-fade-in-scale">
            <div className="container mx-auto px-4 py-4 space-y-4">
              {/* Mobile stats */}
              <div className="grid grid-cols-4 gap-2">
                <MobileStatCard value={activeCount} label="Active" color="text-primary-400" />
                <MobileStatCard value={completedCount} label="Done" color="text-green-400" />
                <MobileStatCard value={totalCount} label="Total" color="text-slate-300" />
                <MobileStatCard value={`${completionPct}%`} label="Done" color="text-accent-cyan" />
              </div>
              {/* User + logout */}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary-500 to-accent-purple flex items-center justify-center text-white text-xs font-bold">
                    {initials}
                  </div>
                  <span className="text-sm font-medium text-slate-300">{userName}</span>
                </div>
                <button
                  onClick={onLogout}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            </div>
          </div>
        )}
      </header>
    </>
  );
};

const StatChip: React.FC<{ icon: React.ReactNode; value: number; label: string; color: string }> = ({ icon, value, label, color }) => (
  <div className="flex items-center gap-1.5 px-2 py-1">
    {icon}
    <span className={`text-sm font-bold ${color}`}>{value}</span>
    <span className="text-xs text-slate-500">{label}</span>
  </div>
);

const MobileStatCard: React.FC<{ value: number | string; label: string; color: string }> = ({ value, label, color }) => (
  <div className="bg-surface border border-border rounded-xl p-2.5 text-center">
    <div className={`text-lg font-bold ${color}`}>{value}</div>
    <div className="text-xs text-slate-500">{label}</div>
  </div>
);

export default Navbar;
