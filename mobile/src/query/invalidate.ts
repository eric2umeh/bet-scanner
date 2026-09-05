import { queryClient, queryKeys } from './client';
import { notifyTipsListChanged } from '../store/tipsEvents';

export async function invalidateTipsCache() {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.tipStats }),
    queryClient.invalidateQueries({ queryKey: queryKeys.pendingLoggedTips }),
  ]);
  await queryClient.refetchQueries({ queryKey: queryKeys.tipStats });
  notifyTipsListChanged();
}
