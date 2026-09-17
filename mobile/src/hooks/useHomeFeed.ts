import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';

import { fetchHomeFeed, type HomeFeed } from '../api/homeFeed';
import { queryClient, queryKeys } from '../query/client';
import { setMatchCache } from '../store/matchCache';

function applyHomeFeed(data: HomeFeed | undefined) {
  if (!data) return;
  setMatchCache(data.matches, data.picks);
}

export function useHomeFeed() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.homeFeed,
    queryFn: ({ signal }) => fetchHomeFeed({ signal }),
    staleTime: 90_000,
    gcTime: 1000 * 60 * 60 * 24 * 7,
    networkMode: 'offlineFirst',
    retry: 1,
  });

  useEffect(() => {
    applyHomeFeed(query.data);
  }, [query.data]);

  const refetchHome = useCallback(async () => {
    await qc.refetchQueries({ queryKey: queryKeys.homeFeed });
    applyHomeFeed(qc.getQueryData<HomeFeed>(queryKeys.homeFeed));
  }, [qc]);

  return {
    ...query,
    feed: query.data,
    refetchHome,
  };
}

export async function invalidateHomeFeed() {
  await queryClient.invalidateQueries({ queryKey: queryKeys.homeFeed });
}

export async function prefetchHomeFeed() {
  await queryClient.prefetchQuery({
    queryKey: queryKeys.homeFeed,
    queryFn: ({ signal }) => fetchHomeFeed({ signal }),
  });
  applyHomeFeed(queryClient.getQueryData<HomeFeed>(queryKeys.homeFeed));
}
