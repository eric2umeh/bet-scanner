import { queryClient, queryKeys } from './client';

export async function invalidateTipsCache() {
  await queryClient.invalidateQueries({ queryKey: queryKeys.tipStats });
  await queryClient.refetchQueries({ queryKey: queryKeys.tipStats });
}
