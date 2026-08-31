import FontAwesome from '@expo/vector-icons/FontAwesome';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/colors';
import { WEB_TAB_BAR_HEIGHT } from '../theme/layout';

const ICONS: Record<string, ComponentProps<typeof FontAwesome>['name']> = {
  index: 'futbol-o',
  tips: 'list',
  arb: 'balance-scale',
  tools: 'th-large',
  me: 'user',
};

/**
 * Custom bottom tabs for Expo web — React Navigation's default bar clips labels
 * and floating styles leave a gap where scroll content shows through.
 */
export function WebTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.shell}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = options.title ?? route.name;
        const focused = state.index === index;
        const tint = focused ? colors.accent : colors.muted;
        const icon = ICONS[route.name] ?? 'circle';

        return (
          <Pressable
            key={route.key}
            style={[styles.item, focused && styles.itemOn]}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            }}
            accessibilityRole="tab"
            accessibilityState={focused ? { selected: true } : {}}
            accessibilityLabel={options.tabBarAccessibilityLabel ?? String(label)}
          >
            <FontAwesome name={icon} size={18} color={tint} />
            <Text style={[styles.label, { color: tint }]} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexDirection: 'row',
    height: WEB_TAB_BAR_HEIGHT,
    backgroundColor: 'rgba(16, 24, 32, 0.98)',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingHorizontal: 4,
    paddingTop: 2,
    paddingBottom: 2,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 0,
  },
  itemOn: {
    backgroundColor: colors.accentDim,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 12,
    textAlign: 'center',
    includeFontPadding: false,
  },
});
