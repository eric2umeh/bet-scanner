import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Pressable, StyleSheet } from 'react-native';

import { useAppModal } from './modal';
import { colors } from '../theme/colors';

type Props = {
  title: string;
  message: string;
};

/** Compact “i” control for screen headers — opens an in-app info alert. */
export function ScreenInfoButton({ title, message }: Props) {
  const modal = useAppModal();

  return (
    <Pressable
      style={styles.btn}
      onPress={() => {
        void modal.alert({ title, message });
      }}
      accessibilityRole="button"
      accessibilityLabel={`${title} info`}
      hitSlop={6}
    >
      <FontAwesome name="info-circle" size={18} color={colors.accent} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    marginRight: 6,
    padding: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(15, 138, 95, 0.35)',
    backgroundColor: 'rgba(15, 138, 95, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
