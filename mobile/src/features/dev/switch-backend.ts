import type { Backend, StagingStatus } from '@/lib/config';

import type { createDevStore } from './store';

type Options = {
  status: StagingStatus;
  store: ReturnType<typeof createDevStore>;
  /** Reloads the JavaScript so the client is created again with the new values. */
  reload: () => void;
};

/** Saves the backend choice and reloads. Staging needs its values; local always works. */
export function switchBackend(
  backend: Backend,
  { status, store, reload }: Options,
): 'switched' | 'same' | 'unavailable' {
  if (store.getState().backend === backend) return 'same';
  if (backend === 'staging' && !status.available) return 'unavailable';
  store.getState().setBackend(backend);
  reload();
  return 'switched';
}
