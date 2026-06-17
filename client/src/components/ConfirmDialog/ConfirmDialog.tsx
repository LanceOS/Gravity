import type { ReactNode } from 'react';
import { Button, type ButtonProps } from '@library';
import { ModalDialog, type ModalDialogRootProps } from '../ModalDialog';
import './ConfirmDialog.css';

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}

export type ConfirmDialogRootProps = Omit<ModalDialogRootProps, 'role' | 'size'> & {
  size?: ModalDialogRootProps['size'];
};

function ConfirmDialogRoot({ closeOnClickAway = false, size = 'sm', ...props }: ConfirmDialogRootProps) {
  return (
    <ModalDialog.Root
      {...props}
      closeOnClickAway={closeOnClickAway}
      role="alertdialog"
      size={size}
      panelClassName={cn('confirm-dialog__panel', props.panelClassName)}
    />
  );
}

export interface ConfirmDialogHeaderProps {
  description?: ReactNode;
  title: ReactNode;
}

function ConfirmDialogHeader({ description, title }: ConfirmDialogHeaderProps) {
  return (
    <ModalDialog.Header
      title={title}
      description={description}
      tone="danger"
      showCloseButton={false}
    />
  );
}

export interface ConfirmDialogBodyProps {
  children: ReactNode;
  className?: string;
}

function ConfirmDialogBody({ children, className }: ConfirmDialogBodyProps) {
  return <ModalDialog.Body className={className}>{children}</ModalDialog.Body>;
}

export interface ConfirmDialogActionsProps {
  cancelLabel?: string;
  children?: ReactNode;
  className?: string;
  confirmDisabled?: boolean;
  confirmLabel: string;
  confirmLoading?: boolean;
  confirmVariant?: ButtonProps['variant'];
  hint?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

function ConfirmDialogActions({
  cancelLabel = 'Cancel',
  children,
  className,
  confirmDisabled,
  confirmLabel,
  confirmLoading,
  confirmVariant = 'danger',
  hint,
  onCancel,
  onConfirm,
}: ConfirmDialogActionsProps) {
  return (
    <ModalDialog.Footer align={hint ? 'between' : 'end'} className={cn('confirm-dialog__footer', className)}>
      {hint ? <span className="confirm-dialog__hint">{hint}</span> : null}
      <ModalDialog.Actions className="confirm-dialog__actions">
        {children}
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={confirmVariant}
          size="sm"
          loading={confirmLoading}
          disabled={confirmDisabled}
          onClick={() => void onConfirm()}
        >
          {confirmLabel}
        </Button>
      </ModalDialog.Actions>
    </ModalDialog.Footer>
  );
}

export const ConfirmDialog = {
  Actions: ConfirmDialogActions,
  Body: ConfirmDialogBody,
  Header: ConfirmDialogHeader,
  Root: ConfirmDialogRoot,
};
