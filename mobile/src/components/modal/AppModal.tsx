import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { colors } from '../../theme/colors';
import { ModalMessage, ModalShell } from './ModalShell';
import type { AppModalOptions } from './types';

type Props = AppModalOptions & {
  visible: boolean;
  onClose: () => void;
};

export function AppModal({
  visible,
  onClose,
  title,
  message,
  children,
  buttons,
  variant = 'center',
  dismissOnBackdrop = true,
  showClose = true,
}: Props) {
  const body = children ?? (message ? <ModalMessage text={message} /> : null);
  const isSheet = variant === 'sheet';

  return (
    <Modal
      visible={visible}
      transparent
      animationType={isSheet ? 'slide' : 'fade'}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.backdrop, isSheet && styles.backdropSheet]}>
        {dismissOnBackdrop ? (
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close modal" />
        ) : null}
        <ModalShell
          title={title}
          onClose={onClose}
          buttons={buttons}
          variant={variant}
          showClose={showClose}
        >
          {body}
        </ModalShell>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
    justifyContent: 'center',
  },
  backdropSheet: {
    justifyContent: 'flex-end',
  },
});
