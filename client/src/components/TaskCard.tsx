import React from 'react';
import { Edit2, Trash2, Check, Clock, AlertCircle, Calendar } from 'lucide-react';
import { Task } from '../types/task';
import PriorityBadge from './PriorityBadge';

interface TaskCardProps {
  task: Task;
  index?: number;
  onToggleComplete: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
}

/** Returns a human-readable relative time string */
function timeAgo(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  if (mins < 1)    return 'just now';
  if (mins < 60)   return `${mins}m ago`;
  if (hours < 24)  return `${hours}h ago`;
  if (days === 1)  return 'yesterday';
  if (days < 7)    return `${days}d ago`;
  if (weeks < 5)   return `${weeks}w ago`;
  if (months < 12) return `${months}mo ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Returns a human-readable due date string */
function dueDateLabel(dateStr: string): { text: string; status: 'overdue' | 'today' | 'tomorrow' | 'soon' | 'future' } {
  const now  = new Date();
  const due  = new Date(dateStr);
  const diff = due.getTime() - now.getTime();
  const days = Math.ceil(diff / 86400000);

  if (diff < 0)       return { text: `Overdue by ${Math.abs(days)}d`,  status: 'overdue' };
  if (days === 0)     return { text: 'Due today',                       status: 'today' };
  if (days === 1)     return { text: 'Due tomorrow',                    status: 'tomorrow' };
  if (days <= 7)      return { text: `Due in ${days} days`,             status: 'soon' };
  return {
    text: `Due ${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    status: 'future',
  };
}

const TaskCard: React.FC<TaskCardProps> = ({ task, index = 0, onToggleComplete, onEdit, onDelete }) => {
  const dueDateObj = task.dueDate ? new Date(task.dueDate) : null;
  const dueInfo    = dueDateObj !== null && !task.completed ? dueDateLabel(task.dueDate as string) : null;

  const delay = Math.min(index * 50, 250);

  return (
    <div
      className={`group relative glass rounded-2xl p-4 lg:p-5 border transition-all duration-200 hover:-translate-y-px ${
        task.completed
          ? 'opacity-55 border-border/40'
          : dueInfo?.status === 'overdue'
          ? 'border-red-500/25 hover:border-red-500/40'
          : 'border-border hover:border-primary-500/35 hover:shadow-card-hover'
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {/* Left priority accent bar */}
      <div className={`absolute left-0 top-3 bottom-3 w-0.5 rounded-full transition-colors duration-200 ${
        task.completed        ? 'bg-green-500/30' :
        dueInfo?.status === 'overdue' ? 'bg-red-500/70' :
        task.priority === 'high'   ? 'bg-red-400/50   group-hover:bg-red-400/80' :
        task.priority === 'medium' ? 'bg-amber-400/50 group-hover:bg-amber-400/80' :
                                      'bg-emerald-400/50 group-hover:bg-emerald-400/80'
      }`} />

      <div className="flex items-start gap-3 ml-3">

        {/* Checkbox */}
        <button
          onClick={() => onToggleComplete(task)}
          className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all duration-200 ${
            task.completed
              ? 'bg-green-500 border-green-500 text-white'
              : 'border-slate-600 hover:border-primary-400 hover:bg-primary-500/10 active:scale-90'
          }`}
          aria-label={task.completed ? 'Mark as incomplete' : 'Mark as complete'}
        >
          {task.completed && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title + badge row */}
          <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
            <h3 className={`text-sm sm:text-base font-semibold leading-snug transition-colors duration-200 ${
              task.completed ? 'line-through text-slate-500' : 'text-slate-100 group-hover:text-white'
            }`}>
              {task.title}
            </h3>
            <PriorityBadge priority={task.priority} />
          </div>

          {/* Description */}
          <p className={`text-sm leading-relaxed transition-colors duration-200 ${
            task.completed ? 'line-through text-slate-600' : 'text-slate-400 group-hover:text-slate-300'
          }`}>
            {task.description}
          </p>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-2.5 mt-2.5">
            {/* Created */}
            <span className="flex items-center gap-1 text-xs text-slate-600">
              <Clock className="w-3 h-3" />
              {timeAgo(task.createdAt)}
            </span>

            {/* Due date */}
            {dueInfo !== null && (
              <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${
                dueInfo.status === 'overdue'  ? 'bg-red-500/12 text-red-400 border-red-500/25' :
                dueInfo.status === 'today'    ? 'bg-red-500/10 text-red-300 border-red-500/20' :
                dueInfo.status === 'tomorrow' ? 'bg-amber-500/12 text-amber-400 border-amber-500/25' :
                dueInfo.status === 'soon'     ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' :
                                                 'bg-slate-700/40 text-slate-400 border-slate-600/30'
              }`}>
                {dueInfo.status === 'overdue' ? <AlertCircle className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
                {dueInfo.text}
              </span>
            )}

            {/* Completed badge */}
            {task.completed && (
              <span className="flex items-center gap-1 text-xs text-green-500/70 font-medium">
                <Check className="w-3 h-3" strokeWidth={2.5} />
                Completed
              </span>
            )}
          </div>
        </div>

        {/* Action buttons — always visible on mobile, hover-only on desktop */}
        <div className="flex gap-1 flex-shrink-0 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-150">
          <button
            onClick={() => onEdit(task)}
            className="p-2 text-slate-500 hover:text-primary-400 hover:bg-primary-500/10 rounded-xl transition-all duration-150 active:scale-90"
            aria-label="Edit task"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(task.id)}
            className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all duration-150 active:scale-90"
            aria-label="Delete task"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default TaskCard;
