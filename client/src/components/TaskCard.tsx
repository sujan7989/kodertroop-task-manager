import React, { useState } from 'react';
import { Calendar, Edit2, Trash2, Check, Clock, AlertCircle } from 'lucide-react';
import { Task } from '../types/task';
import PriorityBadge from './PriorityBadge';

interface TaskCardProps {
  task: Task;
  index?: number;
  onToggleComplete: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, index = 0, onToggleComplete, onEdit, onDelete }) => {
  const [deleting, setDeleting] = useState(false);
  const dueDateObj = task.dueDate ? new Date(task.dueDate) : null;
  const isOverdue = dueDateObj !== null && !task.completed && dueDateObj.getTime() < Date.now();
  const isDueSoon = dueDateObj !== null && !task.completed && !isOverdue &&
    dueDateObj.getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000;

  const handleDelete = () => {
    setDeleting(true);
    setTimeout(() => onDelete(task.id), 200);
  };

  const delay = Math.min(index * 60, 300);

  return (
    <div
      className={`group relative glass rounded-2xl p-4 lg:p-5 card-hover border transition-all duration-300 animate-fade-in-up ${
        task.completed
          ? 'opacity-60 border-border/50'
          : isOverdue
          ? 'border-red-500/30 hover:border-red-500/50'
          : 'border-border hover:border-primary-500/40'
      } ${deleting ? 'scale-95 opacity-0' : ''}`}
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      {/* Left accent bar */}
      <div className={`absolute left-0 top-4 bottom-4 w-0.5 rounded-full transition-all duration-300 ${
        task.completed ? 'bg-green-500/40' :
        isOverdue ? 'bg-red-500/60' :
        task.priority === 'high' ? 'bg-red-400/60 group-hover:bg-red-400' :
        task.priority === 'medium' ? 'bg-yellow-400/60 group-hover:bg-yellow-400' :
        'bg-green-400/60 group-hover:bg-green-400'
      }`} />

      <div className="flex items-start gap-3 ml-3">
        {/* Checkbox */}
        <button
          onClick={() => onToggleComplete(task)}
          className={`mt-0.5 flex-shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all duration-300 ${
            task.completed
              ? 'bg-green-500 border-green-500 text-white scale-100'
              : 'border-slate-600 hover:border-primary-400 hover:bg-primary-500/10'
          }`}
          aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
        >
          {task.completed && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
            <h3 className={`text-base font-semibold leading-snug transition-all duration-300 ${
              task.completed ? 'line-through text-slate-500' : 'text-slate-100 group-hover:text-white'
            }`}>
              {task.title}
            </h3>
            <PriorityBadge priority={task.priority} />
          </div>

          <p className={`text-sm leading-relaxed transition-colors duration-300 ${
            task.completed ? 'line-through text-slate-600' : 'text-slate-400 group-hover:text-slate-300'
          }`}>
            {task.description}
          </p>

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <span className="flex items-center gap-1.5 text-xs text-slate-600">
              <Clock className="w-3 h-3" />
              {new Date(task.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>

            {dueDateObj !== null && (
              <span className={`flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
                isOverdue
                  ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                  : isDueSoon
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  : 'bg-slate-700/50 text-slate-400'
              }`}>
                {isOverdue ? <AlertCircle className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
                {isOverdue ? 'Overdue · ' : isDueSoon ? 'Due soon · ' : 'Due · '}
                {dueDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        </div>

        {/* Actions — visible on hover */}
        <div className="flex gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button
            onClick={() => onEdit(task)}
            className="p-2 text-slate-500 hover:text-primary-400 hover:bg-primary-500/10 rounded-xl transition-all duration-200"
            aria-label="Edit task"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleDelete}
            className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all duration-200"
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
