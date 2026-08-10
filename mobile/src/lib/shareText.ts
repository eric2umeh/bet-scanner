import { Platform, Share } from 'react-native';

/**
 * Share / copy text. Alert.alert + Share are unreliable on Expo web,
 * so we prefer clipboard there and fall back to the native share sheet.
 */
export async function shareOrCopyText(text: string): Promise<'shared' | 'copied'> {
  const value = text.trim();
  if (!value) throw new Error('Nothing to share');

  if (Platform.OS === 'web') {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(value);
      return 'copied';
    }
    if (typeof nav?.share === 'function') {
      await nav.share({ text: value });
      return 'shared';
    }
    throw new Error('Clipboard not available in this browser');
  }

  await Share.share({ message: value });
  return 'shared';
}
