import { Redirect } from 'expo-router';

/** Legacy Tools → Code Scout route; Scout is now a main tab. */
export default function ScoutToolRedirect() {
  return <Redirect href="/(tabs)/scout" />;
}
