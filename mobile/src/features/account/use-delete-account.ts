import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { showToast } from '@/components/ui/toast';
import { useOnline } from '@/features/network';
import { getConfig } from '@/lib/config';
import { reportError } from '@/lib/sentry';
import { supabase } from '@/lib/supabase';

import { runDeleteAccount } from './delete-account';
import { postDeleteAccount } from './server';
import { wipeLocalData } from './wipe-app';

export type DeleteStatus = 'idle' | 'deleting' | 'try_again';

/**
 * The delete sheet's logic (settings.md): one request whatever the taps, the status line for
 * `try_again`, and after `ok` the wipe, then back to the splash, which signs in a new guest.
 */
export function useDeleteAccount(): {
  status: DeleteStatus;
  offline: boolean;
  confirm: () => void;
} {
  const { t } = useTranslation('settings');
  const online = useOnline();
  const [status, setStatus] = useState<DeleteStatus>('idle');
  const running = useRef(false);

  const confirm = useCallback(() => {
    if (running.current || !online) return;
    running.current = true;
    setStatus('deleting');
    void runDeleteAccount({
      getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
      refreshToken: async () =>
        (await supabase.auth.refreshSession()).data.session?.access_token ?? null,
      call: (token) => postDeleteAccount({ serverUrl: getConfig().serverUrl, token }),
      wipe: wipeLocalData,
      report: (message) => reportError(new Error(message)),
    })
      .then((outcome) => {
        if (outcome === 'done') {
          router.dismissAll();
          router.replace('/');
          showToast({ tone: 'info', title: t('delete.done'), duration: 4500 });
          return;
        }
        setStatus('try_again');
      })
      .catch((error: unknown) => {
        reportError(error);
        setStatus('try_again');
      })
      .finally(() => {
        running.current = false;
      });
  }, [online, t]);

  return { status, offline: !online, confirm };
}
