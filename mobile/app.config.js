/** @type {import('expo/config').ExpoConfig} */
const fs = require('fs');
const path = require('path');

/** Read KEY=value lines from .env (Expo Metro workers may not see shell exports). */
function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const root = __dirname;
loadDotEnv(path.join(root, '..', '.env'));
loadDotEnv(path.join(root, '.env'));

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

module.exports = {
  expo: {
    name: 'Bet Scanner',
    slug: 'bet-scanner',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'betscanner',
    userInterfaceStyle: 'dark',
    runtimeVersion: {
      policy: 'appVersion',
    },
    updates: {
      url: 'https://u.expo.dev/27b6a070-e8b3-4a73-b73a-3b3d103e34e4',
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 0,
    },
    splash: {
      image: './assets/images/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#0b1014',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.betscanner.app',
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: 'com.betscanner.app',
      versionCode: 1,
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png',
        backgroundColor: '#0b1014',
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
    },
    web: {
      bundler: 'metro',
      favicon: './assets/images/favicon.png',
    },
    plugins: ['expo-router', 'expo-secure-store', 'expo-updates'],
    extra: {
      router: {},
      eas: {
        projectId: '27b6a070-e8b3-4a73-b73a-3b3d103e34e4',
      },
      supabaseUrl,
      supabaseAnonKey,
    },
    owner: 'eric2umeh',
  },
};
