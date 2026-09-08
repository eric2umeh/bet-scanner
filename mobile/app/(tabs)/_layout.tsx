import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Platform, View } from 'react-native';

import { HelpHeaderButton } from '../../src/components/HelpHeaderButton';
import { ScreenInfoButton } from '../../src/components/ScreenInfoButton';
import { WebTabBar } from '../../src/components/WebTabBar';
import { TOOL_INFO } from '../../src/content/toolInfo';
import { colors } from '../../src/theme/colors';

const isWeb = Platform.OS === 'web';

function TabBarIcon(props: {
  name: ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={22} style={{ marginBottom: -2 }} {...props} />;
}

function TabHeaderRight({ info }: { info: { title: string; message: string } }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <ScreenInfoButton title={info.title} message={info.message} />
      <HelpHeaderButton />
    </View>
  );
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
        sceneStyle: { backgroundColor: colors.bg },
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
          title: 'Home',
          tabBarLabel: 'Home',
          headerShown: !isWeb,
          headerRight: () => <TabHeaderRight info={TOOL_INFO.home} />,
          tabBarIcon: ({ color }) => <TabBarIcon name="futbol-o" color={color} />,
        }}
      />
      <Tabs.Screen
        name="tips"
        options={{
          title: 'Tips',
          headerShown: true,
          headerRight: () => <TabHeaderRight info={TOOL_INFO.tips} />,
          tabBarIcon: ({ color }) => <TabBarIcon name="list" color={color} />,
        }}
      />
      <Tabs.Screen
        name="arb"
        options={{
          title: 'Surebets',
          tabBarLabel: 'Surebets',
          headerShown: true,
          // ArbitragePanel sets headerRight (Find Nigeria + stake); info lives there too.
          tabBarIcon: ({ color }) => <TabBarIcon name="balance-scale" color={color} />,
        }}
      />
      <Tabs.Screen
        name="tools"
        options={{
          title: 'Tools',
          headerShown: true,
          headerRight: () => <TabHeaderRight info={TOOL_INFO.tools} />,
          tabBarIcon: ({ color }) => <TabBarIcon name="th-large" color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          headerShown: true,
          headerRight: () => <TabHeaderRight info={TOOL_INFO.account} />,
          tabBarIcon: ({ color }) => <TabBarIcon name="user" color={color} />,
        }}
      />
    </Tabs>
  );
}
