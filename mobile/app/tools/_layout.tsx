import { Stack } from 'expo-router';

import { HelpHeaderButton } from '../../src/components/HelpHeaderButton';
import { colors } from '../../src/theme/colors';

export default function ToolsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.ink,
        headerShadowVisible: false,
        headerRight: () => <HelpHeaderButton />,
      }}
    >
      <Stack.Screen name="value" options={{ title: 'Value picks' }} />
      <Stack.Screen name="slip" options={{ title: 'Compare slip' }} />
      <Stack.Screen name="tipsters" options={{ title: 'Tipsters' }} />
    </Stack>
  );
}
