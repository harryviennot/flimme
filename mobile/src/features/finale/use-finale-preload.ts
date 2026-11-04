import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useWindowDimensions } from 'react-native';

import { useAppConfig } from '@/features/app-config/use-app-config';
import type { RoomRealtime } from '@/features/room';
import { posterUrl } from '@/features/swipe/poster-url';

import { finalistCardsQuery } from './queries';

/**
 * `finale_started` may load the finalists' cards and posters while the swipe screen is still up
 * (the Final Cut beat). It never moves the screen: only `state_changed` does.
 */
export function useFinalePreload(
  roomId: string | undefined,
  realtime: Pick<RoomRealtime, 'listen'> | null,
) {
  const queryClient = useQueryClient();
  const { i18n } = useTranslation();
  const { width } = useWindowDimensions();
  const imageBase = useAppConfig().data?.tmdb_image_base;

  useEffect(() => {
    if (!roomId || !realtime) return;
    return realtime.listen('finale_started', (payload) => {
      const ids = (payload as { title_ids?: unknown } | null)?.title_ids;
      if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'number')) return;
      void queryClient
        .fetchQuery(finalistCardsQuery(roomId, ids as number[], i18n.language))
        .then((cards) => {
          const urls = cards.flatMap((card) => posterUrl(imageBase, card.poster_path, width) ?? []);
          if (urls.length > 0) void Image.prefetch(urls);
        })
        .catch(() => undefined);
    });
  }, [roomId, realtime, queryClient, i18n.language, imageBase, width]);
}
