import { Stack } from 'expo-router';
import { View } from 'react-native';

import { HelpHeaderButton } from '../../src/components/HelpHeaderButton';
import { ScreenInfoButton } from '../../src/components/ScreenInfoButton';
import { TOOL_INFO } from '../../src/content/toolInfo';
import { colors } from '../../src/theme/colors';

function HeaderRight({ info }: { info: { title: string; message: string } }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <ScreenInfoButton title={info.title} message={info.message} />
      <HelpHeaderButton />
    </View>
  );
}

export default function ToolsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.ink,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="morning"
        options={{
          title: 'Daily update',
          headerRight: () => <HeaderRight info={TOOL_INFO.morning} />,
        }}
      />
      <Stack.Screen
        name="value"
        options={{
          title: 'Value picks',
          headerRight: () => <HeaderRight info={TOOL_INFO.value} />,
        }}
      />
      <Stack.Screen
        name="slip"
        options={{
          title: 'Compare slip',
          headerRight: () => <HeaderRight info={TOOL_INFO.slip} />,
        }}
      />
      <Stack.Screen
        name="tipsters"
        options={{
          title: 'Tipsters',
          headerRight: () => <HeaderRight info={TOOL_INFO.tipsters} />,
        }}
      />
    </Stack>
  );
}
