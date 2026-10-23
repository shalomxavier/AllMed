import { CheckCircle, XCircle, AlertCircle, X, ShieldAlert } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type ToastType = 'success' | 'error' | 'warning';

interface ToastProps {
  type: ToastType;
  message: string;
  duration?: number;
  onClose: () => void;
}

const toastIcons = {
  success: <CheckCircle size={20} className="text-green-600" />,
  error: <XCircle size={20} className="text-red-600" />,
  warning: <AlertCircle size={20} className="text-orange-600" />,
};

const toastColors = {
  success: 'bg-green-50 border-green-200',
  error: 'bg-red-50 border-red-200',
  warning: 'bg-orange-50 border-orange-200',
};

export const Toast: React.FC<ToastProps> = ({
  type,
  message,
  duration = 3000,
  onClose,
}) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div
      className={`w-80 max-w-[calc(100vw-2rem)] p-4 rounded-lg border shadow-lg transition-all duration-300 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      } ${toastColors[type]}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">{toastIcons[type]}</div>
        <div className="flex-1">
          <p className="text-sm font-medium text-secondary-900">{message}</p>
        </div>
        <button
          onClick={() => {
            setIsVisible(false);
            setTimeout(onClose, 300);
          }}
          className="flex-shrink-0 text-secondary-400 hover:text-secondary-600 transition-colors"
          aria-label="Dismiss notification"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  showToast: (type: ToastType, message: string) => void;
}

const PERMISSION_ERROR_PATTERNS = [
  'permission-denied',
  'permission denied',
  'insufficient permissions',
  'missing or insufficient permissions',
  'you can only manage',
  'not authorized',
  'unauthorized',
];

export const isPermissionError = (message: string): boolean => {
  const m = message.toLowerCase();
  return PERMISSION_ERROR_PATTERNS.some((p) => m.includes(p));
};

const PermissionDeniedDialog: React.FC<{ detail: string; onClose: () => void }> = ({ detail, onClose }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
    <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 text-center">
      <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
        <ShieldAlert className="w-7 h-7 text-red-600" />
      </div>
      <h3 className="text-lg font-semibold text-secondary-900 mb-2">Permission Denied</h3>
      <p className="text-sm text-secondary-600 mb-3">
        You don't have permission to perform this action. Please contact your administrator.
      </p>
      {detail && (
        <p className="text-xs text-secondary-400 bg-secondary-50 rounded-lg px-3 py-2 mb-4 break-words">
          {detail}
        </p>
      )}
      <button
        onClick={onClose}
        className="w-full px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
      >
        OK
      </button>
    </div>
  </div>
);

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const showToast = useCallback((type: ToastType, message: string) => {
    if (type === 'error' && isPermissionError(message)) {
      setPermissionError(message);
      return;
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            type={toast.type}
            message={toast.message}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
      {permissionError && (
        <PermissionDeniedDialog detail={permissionError} onClose={() => setPermissionError(null)} />
      )}
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
};
