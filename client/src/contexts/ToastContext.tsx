import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (type: ToastType, message: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = (): ToastContextType => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((type: ToastType, message: string) => {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((prev) => [...prev.slice(-4), { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
};

const toastConfig: Record<ToastType, { icon: React.ReactNode; bar: string; bg: string; border: string; text: string }> = {
  success: {
    icon: <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />,
    bar: 'bg-emerald-500',
    bg: 'bg-surface-elevated',
    border: 'border-emerald-500/30',
    text: 'text-emerald-400',
  },
  error: {
    icon: <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />,
    bar: 'bg-red-500',
    bg: 'bg-surface-elevated',
    border: 'border-red-500/30',
    text: 'text-red-400',
  },
  info: {
    icon: <Info className="w-5 h-5 text-primary-400 flex-shrink-0" />,
    bar: 'bg-primary-500',
    bg: 'bg-surface-elevated',
    border: 'border-primary-500/30',
    text: 'text-primary-400',
  },
};

const ToastContainer: React.FC<{ toasts: Toast[]; onRemove: (id: string) => void }> = ({ toasts, onRemove }) => (
  <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
    {toasts.map((toast) => {
      const cfg = toastConfig[toast.type];
      return (
        <div
          key={toast.id}
          className={`flex items-center gap-3 min-w-[300px] max-w-sm px-4 py-3.5 rounded-2xl border shadow-modal ${cfg.bg} ${cfg.border} pointer-events-auto animate-toast-in overflow-hidden relative`}
        >
          {/* Accent bar */}
          <div className={`absolute left-0 top-0 bottom-0 w-1 ${cfg.bar} rounded-l-2xl`} />
          <div className="ml-1">{cfg.icon}</div>
          <p className="text-sm text-slate-200 flex-1 font-medium">{toast.message}</p>
          <button
            onClick={() => onRemove(toast.id)}
            className="text-slate-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-700/50 flex-shrink-0"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    })}
  </div>
);
