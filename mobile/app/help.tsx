import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { HelpDesk } from '../src/components/HelpDesk';
import { colors } from '../src/theme/colors';

export default function HelpScreen() {
  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: 'Help',
          presentation: 'modal',
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.ink,
          headerShadowVisible: false,
        }}
      />
      <HelpDesk />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
});
