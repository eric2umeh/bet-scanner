import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Platform } from 'react-native';

import { HelpHeaderButton } from '../../src/components/HelpHeaderButton';
import { WebTabBar } from '../../src/components/WebTabBar';
import { colors } from '../../src/theme/colors';

const isWeb = Platform.OS === 'web';

function TabBarIcon(props: {
  name: ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={22} style={{ marginBottom: -2 }} {...props} />;
}

export default function TabLayout() {
  return (
    <Tabs
      tabBar={isWeb ? (props) => <WebTabBar {...props} /> : undefined}
      screenOptions={{
        headerShown: !isWeb,
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.ink,
        headerShadowVisible: false,
        headerRight: () => <HelpHeaderButton />,
        sceneStyle: isWeb ? { backgroundColor: colors.bg } : undefined,
        tabBarStyle: isWeb
          ? { display: 'none' }
          : {
              backgroundColor: colors.surface,
              borderTopColor: colors.line,
              height: 58,
              paddingBottom: 6,
            },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
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
