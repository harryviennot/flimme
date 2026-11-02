// The typed API: the wrappers live in packages/contract, this file only binds the one client.
// Payload shape checks run in development builds and tests, not in production.
import { createApi } from '@flimme/contract';

import { supabase } from '@/lib/supabase';

export const api = createApi(supabase, { validate: __DEV__ });
