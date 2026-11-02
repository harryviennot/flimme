// The one Supabase client. It talks to the `api` schema only (app-structure.md#talking-to-the-backend).
import 'react-native-url-polyfill/auto';

import type { Database } from '@flimme/contract';
import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { getConfig } from './config';
import { sessionStorage } from './session-storage';

export type ApiClient = SupabaseClient<Database, 'api'>;

export function createApiClient(url: string, key: string, storage: SupportedStorage): ApiClient {
  return createClient<Database, 'api'>(url, key, {
    db: { schema: 'api' },
    auth: {
      storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}

// On React Native the auth client can't tell when the app goes to the background, so
// refreshing follows the app's state. Registered once, for the life of the app.
let watching = false;

export function watchAppStateForAuth(client: ApiClient): void {
  if (watching) return;
  watching = true;
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void client.auth.startAutoRefresh();
    else if (state === 'background') void client.auth.stopAutoRefresh();
  });
}

const config = getConfig();

export const supabase = createApiClient(
  config.supabaseUrl,
  config.supabasePublishableKey,
  sessionStorage,
);

watchAppStateForAuth(supabase);
