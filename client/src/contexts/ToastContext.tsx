import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration: number;
  createdAt: number;
}

interface ToastContextType {
  showToast: (type: ToastType, message: string, duration?: number) => void;
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

  const showToast = useCallback((type: ToastType, message: string, duration = 4000) => {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((prev) => [...prev.slice(-4), { id, type, message, duration, createdAt: Date.now() }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration + 400);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
};

const toastConfig: Record<ToastType, {
  icon: React.ReactNode;
  barColor: string;
  borderColor: string;
  iconBg: string;
}> = {
  success: {
    icon: <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400 flex-shrink-0" />,
    barColor: 'bg-emerald-500',
    borderColor: 'border-emerald-500/25',
    iconBg: 'bg-emerald-500/15',
  },
  error: {
    icon: <XCircle className="w-4.5 h-4.5 text-red-400 flex-shrink-0" />,
    barColor: 'bg-red-500',
    borderColor: 'border-red-500/25',
    iconBg: 'bg-red-500/15',
  },
  info: {
    icon: <Info className="w-4.5 h-4.5 text-primary-400 flex-shrink-0" />,
    barColor: 'bg-primary-500',
    borderColor: 'border-primary-500/25',
    iconBg: 'bg-primary-500/15',
  },
};

const ToastItem: React.FC<{ toast: Toast; onRemove: (id: string) => void }> = ({ toast, onRemove }) => {
  const cfg = toastConfig[toast.type];
  const [progress, setProgress] = useState(100);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const start = Date.now();
    const animate = () => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 100 - (elapsed / toast.duration) * 100);
      setProgress(remaining);
      if (remaining > 0) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [toast.duration]);

  return (
    <div
      className={`flex items-center gap-3 min-w-[300px] max-w-xs sm:max-w-sm px-4 py-3.5 rounded-2xl border shadow-2xl pointer-events-auto animate-toast-in overflow-hidden relative`}
      style={{ background: '#1e293b', borderColor: cfg.borderColor.replace('border-', '') }}
    >
      {/* Left accent bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${cfg.barColor} rounded-l-2xl`} />

      {/* Icon */}
      <div className={`ml-1 w-8 h-8 rounded-xl ${cfg.iconBg} flex items-center justify-center flex-shrink-0`}>
        {cfg.icon}
      </div>

      {/* Message */}
      <p className="text-sm text-slate-200 flex-1 font-medium leading-snug">{toast.message}</p>

      {/* Dismiss */}
      <button
        onClick={() => onRemove(toast.id)}
        className="text-slate-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10 flex-shrink-0"
        aria-label="Dismiss notification"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/5">
        <div
          className={`h-full ${cfg.barColor} opacity-60 transition-none`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

const ToastContainer: React.FC<{ toasts: Toast[]; onRemove: (id: string) => void }> = ({ toasts, onRemove }) => (
  <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
    {toasts.map((toast) => (
      <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
    ))}
  </div>
);
