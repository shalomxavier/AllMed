import { useEffect, useRef } from 'react';

export const usePopupDismiss = (isOpen: boolean, onDismiss: () => void) => {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('[data-popup-root]')) return;
      onDismissRef.current();
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen]);
};
