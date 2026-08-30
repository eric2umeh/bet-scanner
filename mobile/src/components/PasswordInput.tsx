import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { colors } from '../theme/colors';

type Props = TextInputProps;

/**
 * Password / secret field with show-hide toggle (eye icon).
 * Flex row layout so the toggle stays visible on web (absolute overlay often hides behind <input>).
 */
export function PasswordInput({ style, ...rest }: Props) {
  const [visible, setVisible] = useState(false);
  const label = visible ? 'Hide' : 'Show';

  return (
    <View style={styles.wrap}>
      <TextInput
        {...rest}
        secureTextEntry={!visible}
        style={[styles.input, style]}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Pressable
        style={styles.toggle}
        onPress={() => setVisible((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        hitSlop={6}
      >
        <FontAwesome
          name={visible ? 'eye-slash' : 'eye'}
          size={20}
          color={visible ? colors.accent : colors.ink}
        />
        {Platform.OS === 'web' ? (
          <Text style={[styles.toggleLabel, visible && styles.toggleLabelOn]}>{label}</Text>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 44,
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 11 : 10,
    color: colors.ink,
    backgroundColor: 'transparent',
    borderWidth: 0,
    ...(Platform.OS === 'web'
      ? ({
          outlineStyle: 'none',
        } as object)
      : null),
  },
  toggle: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 10,
    minWidth: 44,
    minHeight: 44,
    zIndex: 2,
  },
  toggleLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
    userSelect: 'none',
  },
  toggleLabelOn: {
    color: colors.accent,
  },
});
