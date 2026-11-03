import { ApiError, type MyProfile } from '@flimme/contract';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { api } from '@/api';

import { readCachedProfile, saveCachedProfile } from './cache';

export const MY_PROFILE_KEY = ['my_profile'] as const;

/**
 * The signed-in player's profile (`null`: none yet), seeded from the copy kept on the device.
 * The seed counts as stale, so a fresh read always follows. Every successful read is kept.
 * Being offline is not retried: the query pauses and resumes when the connection is back.
 */
export function useMyProfile(enabled = true): UseQueryResult<MyProfile | null> {
  return useQuery({
    queryKey: MY_PROFILE_KEY,
    enabled,
    queryFn: async () => {
      const profile = await api.myProfile();
      if (profile) saveCachedProfile(profile);
      return profile;
    },
    initialData: () => readCachedProfile() ?? undefined,
    initialDataUpdatedAt: 0,
    retry: (count, error) => !(error instanceof ApiError && error.kind === 'network') && count < 1,
  });
}
