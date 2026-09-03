import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, ThemeProvider, type Theme } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { setCachedAccessKey } from '../src/api/client';
import { ConnectionBanner } from '../src/components/ConnectionBanner';
import { WebMobileFrame } from '../src/components/WebMobileFrame';
import { ModalProvider } from '../src/components/modal';
import { AppQueryProvider } from '../src/query/QueryProvider';
import { loadAccessKey } from '../src/store/accessKey';
import { isOnboardingDone } from '../src/store/onboarding';
import { initSession } from '../src/store/session';
import { colors } from '../src/theme/colors';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

const AppNavTheme: Theme = {
  ...DarkTheme,
  dark: true,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.bg,
    card: colors.bg,
    text: colors.ink,
    border: colors.line,
    notification: colors.accent,
  },
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
      await SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
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
    <AppQueryProvider>
      <ModalProvider>
        <ThemeProvider value={AppNavTheme}>
          <StatusBar style="light" backgroundColor={colors.bg} />
          <WebMobileFrame>
            <View style={{ flex: 1, backgroundColor: colors.bg }}>
              <ConnectionBanner />
              <OnboardingGate ready={gateReady} />
              <Stack
                screenOptions={{
                  contentStyle: { backgroundColor: colors.bg },
                  headerStyle: { backgroundColor: colors.bg },
                  headerTintColor: colors.ink,
                  headerShadowVisible: false,
                  headerTitleStyle: { color: colors.ink, fontWeight: '700' },
                  animation: 'slide_from_right',
                }}
              >
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen
                  name="onboarding"
                  options={{ headerShown: false, animation: 'fade' }}
                />
                <Stack.Screen
                  name="match/[id]"
                  options={{
                    title: 'Match',
                    headerBackTitle: 'Back',
                    contentStyle: { backgroundColor: colors.bg },
                    animation: 'slide_from_right',
                  }}
                />
                <Stack.Screen
                  name="help"
                  options={{ headerShown: false, presentation: 'modal' }}
                />
                <Stack.Screen name="tools" options={{ headerShown: false }} />
              </Stack>
            </View>
          </WebMobileFrame>
        </ThemeProvider>
      </ModalProvider>
    </AppQueryProvider>
  );
}
