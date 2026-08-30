import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { colors } from '../theme/colors';

type Props = TextInputProps;

/**
 * Password / secret field with show-hide toggle (eye icon).
 */
export function PasswordInput({ style, ...rest }: Props) {
  const [visible, setVisible] = useState(false);

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
        hitSlop={8}
      >
        <FontAwesome
          name={visible ? 'eye-slash' : 'eye'}
          size={18}
          color={visible ? colors.accent : colors.muted}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  input: {
    backgroundColor: colors.bg,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingRight: 44,
    paddingVertical: 10,
    color: colors.ink,
  },
  toggle: {
    position: 'absolute',
    right: 4,
    height: 40,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
