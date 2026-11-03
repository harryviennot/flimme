import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect } from 'react';

import { openStore } from '@/features/app-config/open-store';
import { useUpdateRequired, watchAppConfig } from '@/features/app-config/use-app-config';

import { UpdateScreen } from './update-screen';

/**
 * Wraps the app: below `min_app_version` only the update screen shows; while the config loads,
 * or when it can't be read, the app shows (app-structure.md#builds-updates-and-versions).
 */
export function UpdateGate({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const updateRequired = useUpdateRequired();

  useEffect(() => {
    const subscription = watchAppConfig(client);
    return () => subscription.remove();
  }, [client]);

  if (updateRequired) return <UpdateScreen onUpdate={() => void openStore().catch(() => {})} />;
  return children;
}
