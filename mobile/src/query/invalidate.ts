import { queryClient, queryKeys } from './client';

export function invalidateTipsCache() {
  void queryClient.invalidateQueries({ queryKey: ['tips'] });
  void queryClient.invalidateQueries({ queryKey: queryKeys.tipStats });
}
