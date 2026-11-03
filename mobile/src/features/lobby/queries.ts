import { useQuery } from '@tanstack/react-query';

import { api } from '@/api';

/** The game modes and their player limits. They change with a release, not during a game. */
export function useGameModes() {
  return useQuery({
    queryKey: ['game_modes'],
    queryFn: () => api.gameModes(),
    staleTime: Number.POSITIVE_INFINITY,
  });
}
