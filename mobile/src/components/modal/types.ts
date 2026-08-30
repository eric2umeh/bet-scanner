import type { ReactNode } from 'react';

export type ModalButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export type ModalButton = {
  label: string;
  onPress?: () => void;
  variant?: ModalButtonVariant;
  /** Disable while async action runs */
  disabled?: boolean;
};

export type ModalVariant = 'center' | 'sheet';

export type AppModalOptions = {
  title: string;
  message?: string;
  children?: ReactNode;
  buttons?: ModalButton[];
  variant?: ModalVariant;
  /** Tap backdrop to dismiss (default true for center alerts) */
  dismissOnBackdrop?: boolean;
  showClose?: boolean;
};

export type AlertOptions = {
  title: string;
  message?: string;
  okLabel?: string;
};

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export type AppModalContextValue = {
  show: (options: AppModalOptions) => void;
  hide: () => void;
  alert: (options: AlertOptions) => Promise<void>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};
