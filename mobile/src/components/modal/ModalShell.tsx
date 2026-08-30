import FontAwesome from '@expo/vector-icons/FontAwesome';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../../theme/colors';
import type { ModalButton, ModalButtonVariant, ModalVariant } from './types';

type Props = {
  title: string;
  onClose?: () => void;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  buttons?: ModalButton[];
  variant?: ModalVariant;
  showClose?: boolean;
  style?: ViewStyle;
  /** Full-height body (modal routes like Help) */
  fill?: boolean;
};

/**
 * Shared modal chrome — header, scroll body, footer buttons.
 * Used inside RN Modal (AppModal) and full-screen modal routes (e.g. Help).
 */
export function ModalShell({
  title,
  onClose,
  children,
  footer,
  buttons,
  variant = 'center',
  showClose = true,
  style,
  fill = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const isSheet = variant === 'sheet';

  return (
    <KeyboardAvoidingView
      style={[styles.wrap, isSheet && styles.wrapSheet, fill && styles.wrapFill]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View
        style={[
          styles.card,
          isSheet && styles.cardSheet,
          fill && styles.cardFill,
          isSheet && { paddingBottom: Math.max(insets.bottom, 16) },
          style,
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          {showClose && onClose ? (
            <Pressable
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
            >
              <FontAwesome name="times" size={18} color={colors.muted} />
            </Pressable>
          ) : (
            <View style={styles.closeSpacer} />
          )}
        </View>

        {children ? (
          <ScrollView
            style={[styles.body, fill && styles.bodyFill]}
            contentContainerStyle={[styles.bodyContent, fill && styles.bodyContentFill]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        ) : null}

        {footer}
        {buttons?.length ? (
          <View style={styles.footer}>
            {buttons.map((btn) => {
              const v = btn.variant ?? 'secondary';
              const s = BTN_STYLES[v];
              return (
                <Pressable
                  key={btn.label}
                  style={[styles.btn, s.box, btn.disabled && styles.btnDisabled]}
                  disabled={btn.disabled}
                  onPress={btn.onPress}
                >
                  <Text style={[styles.btnText, s.text]}>{btn.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  wrapSheet: {
    justifyContent: 'flex-end',
    paddingHorizontal: 0,
  },
  wrapFill: { paddingHorizontal: 0 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    maxHeight: '85%',
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    overflow: 'hidden',
  },
  cardSheet: {
    maxWidth: '100%',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    maxHeight: '92%',
  },
  cardFill: {
    flex: 1,
    maxHeight: '100%',
    borderRadius: 0,
    borderWidth: 0,
    maxWidth: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  title: {
    flex: 1,
    color: colors.ink,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeSpacer: { width: 36 },
  body: { maxHeight: 360 },
  bodyFill: { flex: 1, maxHeight: undefined },
  bodyContent: { paddingHorizontal: 18, paddingVertical: 14 },
  bodyContentFill: { flexGrow: 1, paddingBottom: 24 },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 18,
    paddingBottom: 18,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  btn: {
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  btnText: { fontWeight: '700', fontSize: 15 },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: { color: '#06241c' },
  btnSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  btnSecondaryText: { color: colors.ink },
  btnDanger: {
    backgroundColor: 'rgba(239, 107, 107, 0.15)',
    borderWidth: 1,
    borderColor: colors.bad,
  },
  btnDangerText: { color: colors.bad },
  btnGhost: { backgroundColor: 'transparent' },
  btnGhostText: { color: colors.muted },
  btnDisabled: { opacity: 0.5 },
});

const BTN_STYLES: Record<
  ModalButtonVariant,
  { box: object; text: object }
> = {
  primary: { box: styles.btnPrimary, text: styles.btnPrimaryText },
  secondary: { box: styles.btnSecondary, text: styles.btnSecondaryText },
  danger: { box: styles.btnDanger, text: styles.btnDangerText },
  ghost: { box: styles.btnGhost, text: styles.btnGhostText },
};

/** Plain message body for alert / confirm modals */
export function ModalMessage({ text }: { text: string }) {
  return <Text style={messageStyles.text}>{text}</Text>;
}

const messageStyles = StyleSheet.create({
  text: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
});
