import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';

import { colors } from '../../src/theme/colors';

function TabBarIcon(props: {
  name: ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={24} style={{ marginBottom: -2 }} {...props} />;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.ink,
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
        },
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
        name="tipsters"
        options={{
          title: 'Tipsters',
          tabBarIcon: ({ color }) => <TabBarIcon name="users" color={color} />,
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
