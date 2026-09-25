import { useEffect, useRef } from 'react';

let scrollLockCount = 0;

const lockScroll = (): void => {
  scrollLockCount += 1;
  if (scrollLockCount === 1) {
    document.body.style.overflow = 'hidden';
  }
};

const unlockScroll = (): void => {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    document.body.style.overflow = '';
  }
};

interface StackEntry {
  onClose: () => void;
  isDismissible: () => boolean;
}

// Open-modal stack so Escape only closes the topmost modal when modals nest.
const openStack: StackEntry[] = [];

interface ModalBehaviorOptions {
  /** When false, Escape will not close the modal (e.g. while an operation is in flight). */
  dismissible?: boolean;
}

/**
 * Shared minimum behavior for modals:
 * - Escape key closes the topmost dismissible modal.
 * - Body scroll is locked while the modal is open (nested-modal safe).
 */
export const useModalBehavior = (
  open: boolean,
  onClose: () => void,
  { dismissible = true }: ModalBehaviorOptions = {},
): void => {
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);
  onCloseRef.current = onClose;
  dismissibleRef.current = dismissible;

  useEffect(() => {
    if (!open) return;

    lockScroll();

    const entry: StackEntry = {
      onClose: () => onCloseRef.current(),
      isDismissible: () => dismissibleRef.current,
    };
    openStack.push(entry);

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      const top = openStack[openStack.length - 1];
      if (top === entry && top.isDismissible()) entry.onClose();
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      unlockScroll();
      window.removeEventListener('keydown', onKeyDown);
      const i = openStack.indexOf(entry);
      if (i !== -1) openStack.splice(i, 1);
    };
  }, [open]);
};
