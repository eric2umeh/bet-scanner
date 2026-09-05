import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 1000 * 60 * 60 * 24,
      retry: 1,
    },
  },
});

export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'betScannerQueryCache',
});

export const queryKeys = {
  tipStats: ['tipStats'] as const,
  authStatus: ['authStatus'] as const,
  /** Pending tips used for Today strikethrough — keep fetches rare. */
  pendingLoggedTips: ['pendingLoggedTips'] as const,
};
