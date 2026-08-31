import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { HelpHeaderButton } from '../../src/components/HelpHeaderButton';
import { colors } from '../../src/theme/colors';

const isWeb = Platform.OS === 'web';

function TabBarIcon(props: {
  name: ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={22} style={{ marginBottom: -2 }} {...props} />;
}

/** Floating bottom nav on web — matches legacy `.tabbar`. */
function WebTabBarBackground() {
  if (!isWeb) return null;
  return <View style={webTabStyles.glow} pointerEvents="none" />;
}

const webTabStyles = StyleSheet.create({
  glow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 72,
    backgroundColor: 'rgba(11, 16, 20, 0.55)',
  },
});

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: !isWeb,
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.ink,
        headerShadowVisible: false,
        headerRight: () => <HelpHeaderButton />,
        tabBarBackground: () => <WebTabBarBackground />,
        tabBarStyle: {
          backgroundColor: isWeb ? 'rgba(16, 24, 32, 0.94)' : colors.surface,
          borderTopColor: colors.line,
          height: isWeb ? 58 : 58,
          paddingBottom: isWeb ? 8 : 6,
          paddingTop: isWeb ? 6 : 0,
          borderTopWidth: 1,
          ...(isWeb
            ? {
                position: 'absolute',
                left: 12,
                right: 12,
                bottom: 10,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.line,
                maxWidth: 696,
                alignSelf: 'center',
                marginHorizontal: 'auto',
              }
            : null),
        },
        tabBarLabelStyle: {
          fontSize: isWeb ? 10 : 11,
          fontWeight: '600',
        },
        tabBarItemStyle: isWeb ? { paddingHorizontal: 0 } : undefined,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ color }) => <TabBarIcon name="futbol-o" color={color} />,
        }}
      />
      <Tabs.Screen
        name="tips"
        options={{
          title: 'Tips',
          tabBarIcon: ({ color }) => <TabBarIcon name="list" color={color} />,
        }}
      />
      <Tabs.Screen
        name="arb"
        options={{
          title: 'Arb',
          tabBarIcon: ({ color }) => <TabBarIcon name="balance-scale" color={color} />,
        }}
      />
      <Tabs.Screen
        name="tools"
        options={{
          title: 'Tools',
          tabBarIcon: ({ color }) => <TabBarIcon name="th-large" color={color} />,
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: 'Me',
          tabBarIcon: ({ color }) => <TabBarIcon name="user" color={color} />,
        }}
      />
    </Tabs>
  );
}
