import AsyncStorage from '@react-native-async-storage/async-storage';

const SCORE_REFRESH_KEY = 'autoSettleScoreRefreshAt';
/** Min gap between odds-api score fetches from background auto-settle (6h). */
const SCORE_REFRESH_MS = 6 * 60 * 60 * 1000;

export async function shouldRunScoreRefresh(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(SCORE_REFRESH_KEY);
    const last = raw ? Number(raw) : 0;
    if (!Number.isFinite(last)) return true;
    return Date.now() - last >= SCORE_REFRESH_MS;
  } catch {
    return false;
  }
}

export async function markScoreRefreshRan(): Promise<void> {
  try {
    await AsyncStorage.setItem(SCORE_REFRESH_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}
