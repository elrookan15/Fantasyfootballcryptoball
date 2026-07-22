import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';

type ToastType = 'info' | 'success' | 'warning' | 'error';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  addToast: (message: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto remove after 5 seconds
    setTimeout(() => {
      removeToast(id);
    }, 5000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`min-w-[250px] p-4 text-[10px] font-mono leading-relaxed uppercase tracking-widest border border-l-4 shadow-[0_0_15px_rgba(0,0,0,0.5)] ${
              toast.type === 'info' ? 'bg-[#010409]/95 border-cyan-500/30 border-l-cyan-500 text-cyan-400' :
              toast.type === 'success' ? 'bg-[#010409]/95 border-green-500/30 border-l-green-500 text-green-400' :
              toast.type === 'warning' ? 'bg-[#010409]/95 border-yellow-500/30 border-l-yellow-500 text-yellow-400' :
              'bg-[#010409]/95 border-red-500/30 border-l-red-500 text-red-500'
            }`}
            style={{ animation: 'toast-slide-in 0.3s ease-out forwards' }}
          >
            <div className="flex justify-between items-start gap-4">
              <span>{toast.message}</span>
              <button onClick={() => removeToast(toast.id)} className="text-slate-500 hover:text-white transition-colors">✕</button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
