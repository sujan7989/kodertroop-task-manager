import React, { useState, useEffect } from 'react';
import { X, Save, Plus, Sparkles } from 'lucide-react';
import { Task, TaskPriority, CreateTaskInput, UpdateTaskInput } from '../types/task';

interface TaskModalProps {
  mode: 'create' | 'edit';
  initialValues?: Partial<Pick<Task, 'title' | 'description' | 'priority' | 'dueDate' | 'completed'>>;
  onSubmit: (input: CreateTaskInput | UpdateTaskInput) => void;
  onClose: () => void;
  isLoading?: boolean;
}

const TaskModal: React.FC<TaskModalProps> = ({ mode, initialValues, onSubmit, onClose, isLoading = false }) => {
  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [priority, setPriority] = useState<TaskPriority>(initialValues?.priority ?? 'medium');
  const [dueDate, setDueDate] = useState(() => {
    if (!initialValues?.dueDate) return '';
    const d = new Date(initialValues.dueDate);
    return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'create') {
      onSubmit({ title: title.trim(), description: description.trim(), priority, dueDate: dueDate ? new Date(dueDate).toISOString() : undefined } satisfies CreateTaskInput);
    } else {
      onSubmit({ title: title.trim(), description: description.trim(), priority, dueDate: dueDate ? new Date(dueDate).toISOString() : null } satisfies UpdateTaskInput);
    }
  };

  const priorityOpts: { value: TaskPriority; label: string; active: string; hover: string; dot: string }[] = [
    { value: 'low',    label: 'Low',    active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.2)]', hover: 'hover:border-emerald-500/30 hover:text-emerald-400', dot: 'bg-emerald-400' },
    { value: 'medium', label: 'Medium', active: 'bg-amber-500/20 text-amber-400 border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.2)]',       hover: 'hover:border-amber-500/30 hover:text-amber-400',   dot: 'bg-amber-400' },
    { value: 'high',   label: 'High',   active: 'bg-red-500/20 text-red-400 border-red-500/50 shadow-[0_0_12px_rgba(239,68,68,0.2)]',             hover: 'hover:border-red-500/30 hover:text-red-400',       dot: 'bg-red-400' },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-backdrop"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-strong rounded-3xl w-full max-w-lg shadow-modal animate-fade-in-scale border border-border/50">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-accent-purple flex items-center justify-center">
              {mode === 'create' ? <Plus className="w-5 h-5 text-white" /> : <Sparkles className="w-5 h-5 text-white" />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{mode === 'create' ? 'New Task' : 'Edit Task'}</h2>
              <p className="text-xs text-slate-500">{mode === 'create' ? 'Add something to your list' : 'Update task details'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-500 hover:text-white hover:bg-surface-elevated rounded-xl transition-all" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              required minLength={3} maxLength={120} placeholder="What needs to be done?"
              className="w-full px-4 py-3 bg-surface-secondary border border-border rounded-xl focus:outline-none focus:border-primary-500 input-glow text-white placeholder-slate-500 transition-all"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Description <span className="text-red-400">*</span>
            </label>
            <textarea
              value={description} onChange={(e) => setDescription(e.target.value)}
              required minLength={3} maxLength={2000} rows={3}
              placeholder="Add more context..."
              className="w-full px-4 py-3 bg-surface-secondary border border-border rounded-xl focus:outline-none focus:border-primary-500 input-glow text-white placeholder-slate-500 transition-all resize-none"
            />
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Priority</label>
            <div className="grid grid-cols-3 gap-2">
              {priorityOpts.map((opt) => (
                <button
                  key={opt.value} type="button" onClick={() => setPriority(opt.value)}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all duration-200 ${
                    priority === opt.value ? opt.active : `text-slate-400 border-border ${opt.hover}`
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${opt.dot}`} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Due Date */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Due Date <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <input
              type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-4 py-3 bg-surface-secondary border border-border rounded-xl focus:outline-none focus:border-primary-500 input-glow text-white transition-all [color-scheme:dark]"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="submit" disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-primary-600 to-accent-purple hover:from-primary-500 hover:to-accent-purple text-white font-semibold rounded-xl transition-all duration-300 shadow-glow hover:shadow-glow-lg hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0"
            >
              {mode === 'create' ? <Plus className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {isLoading ? 'Saving...' : mode === 'create' ? 'Create Task' : 'Save Changes'}
            </button>
            <button
              type="button" onClick={onClose}
              className="px-5 py-3 bg-surface-secondary hover:bg-surface-elevated text-slate-300 hover:text-white font-medium rounded-xl transition-all border border-border hover:border-border-light"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TaskModal;
