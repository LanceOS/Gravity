import {
  createContext,
  useRef,
  useContext,
  useEffect,
  useId,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@library';
import { X } from 'lucide-react';
import './ModalDialog.css';

type ModalDialogSize = 'sm' | 'md' | 'lg' | 'xl';
type ModalDialogTone = 'default' | 'danger';

interface ModalDialogContextValue {
  descriptionId: string;
  onClose: () => void;
  titleId: string;
}

const ModalDialogContext = createContext<ModalDialogContextValue | null>(null);

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}

function useModalDialogContext() {
  const context = useContext(ModalDialogContext);

  if (!context) {
    throw new Error('ModalDialog compound components must be rendered inside ModalDialog.Root.');
  }

  return context;
}

export interface ModalDialogRootProps {
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
  closeOnClickAway?: boolean;
  closeOnEscape?: boolean;
  isOpen: boolean;
  onClose: () => void;
  panelClassName?: string;
  role?: 'dialog' | 'alertdialog';
  size?: ModalDialogSize;
  style?: CSSProperties;
}

function ModalDialogRoot({
  ariaLabel,
  children,
  className,
  closeOnClickAway = true,
  closeOnEscape = true,
  isOpen,
  onClose,
  panelClassName,
  role = 'dialog',
  size = 'md',
  style,
}: ModalDialogRootProps) {
  const generatedId = useId();
  const titleId = `modal-dialog-title-${generatedId}`;
  const descriptionId = `modal-dialog-description-${generatedId}`;
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (closeOnEscape) {
          onClose();
        }
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) {
        return;
      }

      const focusableElements = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => {
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });

      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        lastElement.focus();
        event.preventDefault();
        return;
      }

      if (!event.shiftKey && document.activeElement === lastElement) {
        firstElement.focus();
        event.preventDefault();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeOnEscape, isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !panelRef.current) {
      return;
    }

    const firstFocusableElement = panelRef.current.querySelector<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    );

    firstFocusableElement?.focus();
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div
      className={cn('modal-dialog__overlay lib-animate-fade-in', className)}
      onMouseDown={(event) => {
        if (closeOnClickAway && event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        aria-label={ariaLabel}
        aria-labelledby={ariaLabel ? undefined : titleId}
        className={cn('modal-dialog__panel', `modal-dialog__panel--${size}`, panelClassName)}
        ref={panelRef}
        role={role}
        aria-modal="true"
        style={style}
      >
        <ModalDialogContext.Provider value={{ descriptionId, onClose, titleId }}>
          {children}
        </ModalDialogContext.Provider>
      </div>
    </div>,
    document.body,
  );
}

export interface ModalDialogHeaderProps {
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  description?: ReactNode;
  showCloseButton?: boolean;
  title?: ReactNode;
  tone?: ModalDialogTone;
}

function ModalDialogHeader({
  actions,
  children,
  className,
  description,
  showCloseButton = true,
  title,
  tone = 'default',
}: ModalDialogHeaderProps) {
  const { descriptionId, onClose, titleId } = useModalDialogContext();

  return (
    <header className={cn('modal-dialog__header', `modal-dialog__header--${tone}`, className)}>
      <div className="modal-dialog__title-group">
        {title ? (
          <h2 className="modal-dialog__title" id={titleId}>
            {title}
          </h2>
        ) : null}
        {description ? (
          <p className="modal-dialog__description" id={descriptionId}>
            {description}
          </p>
        ) : null}
        {children}
      </div>

      <div className="modal-dialog__header-actions">
        {actions}
        {showCloseButton ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-label="Close dialog"
            className="modal-dialog__close-button"
            onClick={onClose}
          >
            <X size={16} />
          </Button>
        ) : null}
      </div>
    </header>
  );
}

export interface ModalDialogBodyProps {
  children: ReactNode;
  className?: string;
  scrollable?: boolean;
}

function ModalDialogBody({ children, className, scrollable = true }: ModalDialogBodyProps) {
  return (
    <div
      className={cn(
        'modal-dialog__body',
        scrollable && 'modal-dialog__body--scrollable',
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface ModalDialogFooterProps {
  align?: 'start' | 'end' | 'between';
  children: ReactNode;
  className?: string;
}

function ModalDialogFooter({ align = 'end', children, className }: ModalDialogFooterProps) {
  return (
    <footer className={cn('modal-dialog__footer', `modal-dialog__footer--${align}`, className)}>
      {children}
    </footer>
  );
}

export interface ModalDialogActionsProps {
  children: ReactNode;
  className?: string;
}

function ModalDialogActions({ children, className }: ModalDialogActionsProps) {
  return <div className={cn('modal-dialog__actions', className)}>{children}</div>;
}

export interface ModalDialogFeedbackProps {
  children: ReactNode;
  className?: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

function ModalDialogFeedback({ children, className, type }: ModalDialogFeedbackProps) {
  return (
    <div className={cn('modal-dialog__feedback', `modal-dialog__feedback--${type}`, className)} role="alert">
      {children}
    </div>
  );
}

export const ModalDialog = {
  Actions: ModalDialogActions,
  Body: ModalDialogBody,
  Feedback: ModalDialogFeedback,
  Footer: ModalDialogFooter,
  Header: ModalDialogHeader,
  Root: ModalDialogRoot,
};
