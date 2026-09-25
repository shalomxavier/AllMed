import { useCallback } from 'react';
import { useModalBehavior } from './useModalBehavior';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** When false, Escape/backdrop will not close the modal. */
  dismissible?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '5xl';
  className?: string;
  children: React.ReactNode;
}

const sizeClasses: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '5xl': 'max-w-5xl',
};

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  dismissible = true,
  size = 'md',
  className = '',
  children,
}) => {
  const handleClose = useCallback(() => {
    if (dismissible) onClose();
  }, [dismissible, onClose]);

  useModalBehavior(open, onClose, { dismissible });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`bg-white rounded-xl shadow-xl w-full ${sizeClasses[size]} max-h-[90vh] overflow-y-auto ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
};
