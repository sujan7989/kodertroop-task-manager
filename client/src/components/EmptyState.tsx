import React from 'react';
import { CheckSquare, Plus, Search, Filter } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  type?: 'empty' | 'search' | 'filter';
}

const icons = {
  empty:  <CheckSquare className="w-10 h-10 text-primary-400/60" />,
  search: <Search className="w-10 h-10 text-slate-500" />,
  filter: <Filter className="w-10 h-10 text-slate-500" />,
};

const EmptyState: React.FC<EmptyStateProps> = ({ title, description, action, type = 'empty' }) => (
  <div className="flex flex-col items-center justify-center py-20 animate-fade-in-up">
    <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-5 ${
      type === 'empty' ? 'bg-primary-500/10 border border-primary-500/20 animate-pulse-glow' : 'bg-surface-secondary border border-border'
    }`}>
      {icons[type]}
    </div>
    <h3 className="text-lg font-semibold text-slate-200 mb-2">{title}</h3>
    {description && <p className="text-sm text-slate-500 mb-6 text-center max-w-xs">{description}</p>}
    {action && (
      <button
        onClick={action.onClick}
        className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary-600 to-accent-purple text-white text-sm font-semibold rounded-xl shadow-glow hover:shadow-glow-lg hover:-translate-y-0.5 transition-all duration-200"
      >
        <Plus className="w-4 h-4" />
        {action.label}
      </button>
    )}
  </div>
);

export default EmptyState;
