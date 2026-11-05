import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useCallback, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelRatio } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { showToast } from '@/components/ui/toast';
import { haptics } from '@/lib/haptics';
import { track } from '@/lib/analytics';
import { reportError } from '@/lib/sentry';

import type { PosterGate } from './poster-gate';
import { runRecapShare } from './share';

/** The image's size in pixels: a story's shape, three pixels to each point of the 360 by 640 card. */
export const RECAP_IMAGE = { width: 1080, height: 1920 } as const;

/** view-shot sizes the file in points and multiplies by the screen scale: ask for 1080 by 1920 pixels. */
export const recapCaptureSize = (pixelRatio: number) => ({
  width: RECAP_IMAGE.width / pixelRatio,
  height: RECAP_IMAGE.height / pixelRatio,
});

/**
 * Share on the recap sheet: one share at a time, `busy` while the image is made. The card in
 * `cardRef` is the full-size copy, never the scaled preview (recap.md#the-capture-copy).
 */
export function useRecapShare(
  cardRef: RefObject<object | null>,
  gate: PosterGate,
): { share: () => void; busy: boolean } {
  const { t } = useTranslation('recap');
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  const share = useCallback(() => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    void runRecapShare({
      waitForPoster: () => gate.wait(),
      capture: async () => {
        if (!cardRef.current) throw new Error('recap: no card to capture');
        return captureRef(cardRef.current as Parameters<typeof captureRef>[0], {
          format: 'png',
          result: 'tmpfile',
          ...recapCaptureSize(PixelRatio.get()),
        });
      },
      share: (uri) =>
        Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          UTI: 'public.png',
          dialogTitle: t('sheet.title'),
        }),
      deleteFile: (uri) => new File(uri).delete(),
      // No film id or title: the method only (recap.md#sharing).
      onShared: () => track('winner:recap_share', { method: 'share_sheet' }),
    })
      .then((outcome) => {
        // iOS and Android both resolve a cancelled share like a real one (no toast, tracked); a
        // rejection means the system sheet failed.
        if (outcome === 'capture_failed' || outcome === 'share_failed') {
          reportError(new Error(`recap: ${outcome}`));
          showToast({
            tone: 'warn',
            title: t(outcome === 'capture_failed' ? 'errors.capture' : 'errors.share'),
          });
          haptics.error();
        }
      })
      .finally(() => {
        running.current = false;
        setBusy(false);
      });
  }, [cardRef, gate, t]);

  return { share, busy };
}
