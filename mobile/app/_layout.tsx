import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { setCachedAccessKey } from '../src/api/client';
import { ConnectionBanner } from '../src/components/ConnectionBanner';
import { loadAccessKey } from '../src/store/accessKey';
import { isOnboardingDone } from '../src/store/onboarding';
import { initSession } from '../src/store/session';
import { colors } from '../src/theme/colors';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync().catch(() => {});

function OnboardingGate({ ready }: { ready: boolean }) {
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      const done = await isOnboardingDone();
      if (cancelled) return;
      const onOnboarding = segments[0] === 'onboarding';
      if (!done && !onOnboarding) {
        router.replace('/onboarding');
      } else if (done && onOnboarding) {
        router.replace('/(tabs)');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, segments, router]);

  return null;
}

export default function RootLayout() {
  const [loaded] = useFonts({
    ...FontAwesome.font,
  });
  const [gateReady, setGateReady] = useState(false);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);

  useEffect(() => {
    const t = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const key = await loadAccessKey();
      await initSession();
      if (cancelled) return;
      setCachedAccessKey(key || null);
      setGateReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded || !gateReady) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ThemeProvider value={DarkTheme}>
      <StatusBar style="light" />
      <View style={{ flex: 1, backgroundColor: '#0b1014' }}>
        <ConnectionBanner />
        <OnboardingGate ready={gateReady} />
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen
            name="match/[id]"
            options={{ headerShown: false, animation: 'slide_from_right' }}
          />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Info' }} />
        </Stack>
      </View>
    </ThemeProvider>
  );
}
