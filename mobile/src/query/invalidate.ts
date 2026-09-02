import { queryClient, queryKeys } from './client';
import { notifyTipsListChanged } from '../store/tipsEvents';

export async function invalidateTipsCache() {
  await queryClient.invalidateQueries({ queryKey: queryKeys.tipStats });
  await queryClient.refetchQueries({ queryKey: queryKeys.tipStats });
  notifyTipsListChanged();
}
