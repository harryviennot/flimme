import { QueryClient } from '@tanstack/react-query';

// Server data lives in TanStack Query (app-structure.md#where-state-lives). Realtime
// events keep it fresh, so queries don't poll.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});
