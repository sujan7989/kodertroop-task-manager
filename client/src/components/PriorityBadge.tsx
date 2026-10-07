import React from 'react';
import { TaskPriority } from '../types/task';
import { AlertTriangle, Minus, ArrowDown } from 'lucide-react';

interface PriorityBadgeProps {
  priority: TaskPriority;
  size?: 'sm' | 'md';
}

const config: Record<TaskPriority, { label: string; classes: string; icon: React.ReactNode }> = {
  high:   {
    label: 'High',
    classes: 'bg-red-500/15 text-red-400 border-red-500/30',
    icon: <AlertTriangle className="w-3 h-3" />,
  },
  medium: {
    label: 'Medium',
    classes: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    icon: <Minus className="w-3 h-3" />,
  },
  low:    {
    label: 'Low',
    classes: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    icon: <ArrowDown className="w-3 h-3" />,
  },
};

const PriorityBadge: React.FC<PriorityBadgeProps> = ({ priority, size = 'sm' }) => {
  const { label, classes, icon } = config[priority];
  const sizeClasses = size === 'sm' ? 'text-xs px-2 py-0.5 gap-1' : 'text-sm px-3 py-1 gap-1.5';
  return (
    <span className={`inline-flex items-center rounded-full border font-medium whitespace-nowrap ${sizeClasses} ${classes}`}>
      {icon}
      {label}
    </span>
  );
};

export default PriorityBadge;
