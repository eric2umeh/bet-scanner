import { Redirect } from 'expo-router';

/** Old /me bookmarks → Account tab. */
export default function LegacyMeRedirect() {
  return <Redirect href="/(tabs)/account" />;
}
