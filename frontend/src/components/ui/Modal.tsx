import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useFocusContainment } from '../../hooks/useFocusContainment';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  closeOnEsc?: boolean;
  closeOnBackdropClick?: boolean;
  className?: string;
  ariaLabel?: string;
}

const sizeClasses = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
  full: 'sm:max-w-5xl',
};

/*
 * Dialog.
 *
 * On phones it fills the width and docks to the bottom of the viewport, which
 * keeps the primary action within thumb reach and avoids a cramped centred box.
 * From `sm` up it becomes a centred dialog. Focus is trapped while open and
 * returned to the trigger on close.
 */
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnEsc = true,
  closeOnBackdropClick = true,
  className,
  ariaLabel,
}) => {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();

  React.useEffect(() => {
    if (!isOpen || !closeOnEsc) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, closeOnEsc, onClose]);
  // Prevent the page behind the dialog from scrolling.
  React.useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [isOpen]);

  useFocusContainment(dialogRef, isOpen);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 animate-fade-in sm:items-center sm:p-6"
      onClick={(event) => {
        if (closeOnBackdropClick && event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        // Keep a name on the dialog even when the title is a node rather than
        // a string, otherwise it is announced only as "dialog".
        aria-label={typeof title === 'string' ? title : ariaLabel}
        tabIndex={-1}
        className={cn(
          'flex w-full flex-col overflow-hidden border border-rule bg-white shadow-lg outline-none',
          'max-h-[92dvh] animate-sheet-in rounded-t-2xl',
          'sm:max-h-[90vh] sm:animate-sheet-in sm:rounded-lg',
          sizeClasses[size],
          className,
        )}
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 border-b border-rule bg-paper-100 px-5 py-4">
            <div className="min-w-0 space-y-1">
              {title && (
                <h2 id={titleId} className="text-base font-semibold leading-tight text-ink-900">
                  {title}
                </h2>
              )}
              {description && (
                <p className="text-sm leading-relaxed text-ink-soft">{description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-ink-soft hover:bg-paper-300/60 hover:text-ink-900"
              aria-label="Close dialog"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-rule bg-paper-100 px-5 py-4 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
