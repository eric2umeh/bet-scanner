import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

import { AppModal } from './AppModal';
import { ModalMessage } from './ModalShell';
import type {
  AlertOptions,
  AppModalContextValue,
  AppModalOptions,
  ConfirmOptions,
} from './types';

const ModalContext = createContext<AppModalContextValue | null>(null);

const EMPTY: AppModalOptions = { title: '' };

export function ModalProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppModalOptions & { visible: boolean }>({
    ...EMPTY,
    visible: false,
  });
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const hide = useCallback(() => {
    setState((s) => ({ ...s, visible: false }));
    resolverRef.current?.(false);
    resolverRef.current = null;
  }, []);

  const show = useCallback((options: AppModalOptions) => {
    resolverRef.current = null;
    setState({ ...options, visible: true });
  }, []);

  const alert = useCallback(
    (options: AlertOptions) =>
      new Promise<void>((resolve) => {
        show({
          title: options.title,
          message: options.message,
          variant: 'center',
          buttons: [
            {
              label: options.okLabel ?? 'OK',
              variant: 'primary',
              onPress: () => {
                hide();
                resolve();
              },
            },
          ],
        });
      }),
    [hide, show]
  );

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolverRef.current = resolve;
        show({
          title: options.title,
          message: options.message,
          variant: 'center',
          buttons: [
            {
              label: options.cancelLabel ?? 'Cancel',
              variant: 'ghost',
              onPress: () => {
                hide();
                resolve(false);
              },
            },
            {
              label: options.confirmLabel ?? 'Confirm',
              variant: options.destructive ? 'danger' : 'primary',
              onPress: () => {
                setState((s) => ({ ...s, visible: false }));
                resolverRef.current = null;
                resolve(true);
              },
            },
          ],
        });
      }),
    [hide, show]
  );

  const value = useMemo(
    () => ({ show, hide, alert, confirm }),
    [show, hide, alert, confirm]
  );

  const onClose = hide;
  const modalChildren =
    state.children ??
    (state.message ? <ModalMessage text={state.message} /> : undefined);

  return (
    <ModalContext.Provider value={value}>
      {children}
      <AppModal
        visible={state.visible}
        onClose={onClose}
        title={state.title}
        buttons={state.buttons}
        variant={state.variant}
        dismissOnBackdrop={state.dismissOnBackdrop}
        showClose={state.showClose}
      >
        {modalChildren}
      </AppModal>
    </ModalContext.Provider>
  );
}

export function useAppModal(): AppModalContextValue {
  const ctx = useContext(ModalContext);
  if (!ctx) {
    throw new Error('useAppModal must be used within ModalProvider');
  }
  return ctx;
}
