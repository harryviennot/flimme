import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Backend } from '@/lib/config';
import { persistOptions } from '@/lib/persisted-store';
import type { KeyValueStore } from '@/lib/storage';

// Which backend a development build talks to. Read by lib/config.ts before the Supabase
// client exists; changing it reloads the JavaScript (the dev menu does that).
export type DevSaved = { backend: Backend };
export type DevState = DevSaved & { setBackend: (backend: Backend) => void };

export const DEV_VERSION = 1;

export function readDevSaved(saved: unknown): DevSaved {
  const backend = (saved as Partial<Record<keyof DevSaved, unknown>> | null)?.backend;
  return { backend: backend === 'staging' ? 'staging' : 'local' };
}

export function createDevStore(kv?: KeyValueStore) {
  return create<DevState>()(
    persist(
      (set) => ({
        backend: 'local',
        setBackend: (backend) => set({ backend }),
      }),
      persistOptions<DevState, DevSaved>({
        name: 'dev',
        version: DEV_VERSION,
        migrate: readDevSaved,
        sanitize: readDevSaved,
        partialize: ({ backend }) => ({ backend }),
        kv,
      }),
    ),
  );
}
