import FontAwesome from '@expo/vector-icons/FontAwesome';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/colors';

type Props = {
  icon: ComponentProps<typeof FontAwesome>['name'];
  title: string;
  description: string;
  onPress: () => void;
  accent?: string;
};

export function ToolHubCard({ icon, title, description, onPress, accent }: Props) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={[styles.iconWrap, { backgroundColor: accent ?? colors.accentDim }]}>
        <FontAwesome name={icon} size={22} color={accent ? colors.ink : colors.accent} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.desc}>{description}</Text>
      </View>
      <FontAwesome name="chevron-right" size={14} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 4 },
  title: { color: colors.ink, fontWeight: '700', fontSize: 16 },
  desc: { color: colors.muted, fontSize: 13, lineHeight: 18 },
});
