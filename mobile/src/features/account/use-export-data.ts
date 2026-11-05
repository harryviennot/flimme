import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '@/api';
import { showToast } from '@/components/ui/toast';
import { useOnline } from '@/features/network';
import { haptics } from '@/lib/haptics';
import { reportError } from '@/lib/sentry';

import { runExport } from './export-data';

/**
 * Download my data (settings.md): one request at a time, the row spins until the share sheet
 * opens. Offline sends nothing. Never reports the data, only the status of an odd answer.
 */
export function useExportData(): { start: () => void; busy: boolean } {
  const { t } = useTranslation('settings');
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  const start = useCallback(() => {
    if (running.current) return;
    if (!online) {
      showToast({ tone: 'warn', title: t('errors.offline') });
      return;
    }
    running.current = true;
    setBusy(true);
    void runExport({
      exportMyData: () => api.exportMyData(),
      writeFile: (name, contents) => {
        const file = new File(Paths.cache, name);
        file.create({ overwrite: true });
        file.write(contents);
        return file.uri;
      },
      share: (uri) =>
        Sharing.shareAsync(uri, {
          mimeType: 'application/json',
          UTI: 'public.json',
          dialogTitle: t('export.shareTitle'),
        }),
      deleteFile: (uri) => new File(uri).delete(),
      onReady: () => setBusy(false),
      report: (message) => reportError(new Error(message)),
    })
      .then((outcome) => {
        if (outcome === 'rate_limited') {
          showToast({
            tone: 'info',
            title: t('export.rateLimited.title'),
            message: t('export.rateLimited.message'),
          });
          haptics.error();
        } else if (outcome === 'offline') {
          showToast({ tone: 'warn', title: t('errors.offline') });
        } else if (outcome === 'failed') {
          showToast({
            tone: 'warn',
            title: t('export.failed.title'),
            message: t('export.failed.message'),
          });
        }
      })
      .finally(() => {
        running.current = false;
        setBusy(false);
      });
  }, [online, t]);

  return { start, busy };
}
