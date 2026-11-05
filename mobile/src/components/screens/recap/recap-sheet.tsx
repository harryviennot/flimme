import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, findNodeHandle, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { createPosterGate } from '@/features/recap/poster-gate';
import { formatRecapTime } from '@/features/recap/time';
import { useRecap } from '@/features/recap/use-recap';
import { useRecapShare } from '@/features/recap/use-recap-share';

import { RecapCard } from './recap-card';

// The recap sheet (recap.md): a preview of the card, scaled to fit, and Share. The image is taken
// from a second copy at full size, laid out off screen, never from the scaled preview.

const CARD_WIDTH = 360;
const CARD_HEIGHT = 640;

/** How much the card shrinks to fit the space left, never above its own size. */
export function previewScale(width: number, height: number): number {
  if (width <= 0 || height <= 0) return 0;
  return Math.min(1, width / CARD_WIDTH, height / CARD_HEIGHT);
}

export function RecapSheet({ roomId }: { roomId: string }) {
  const { t, i18n } = useTranslation('recap');
  const { t: tc } = useTranslation();
  const insets = useSafeAreaInsets();
  const view = useRecap(roomId);
  const cardRef = useRef<ComponentRef<typeof View>>(null);
  const titleRef = useRef<ComponentRef<typeof View>>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });

  const posterUri = view.status === 'ready' ? view.posterUri : null;
  const gate = useMemo(() => createPosterGate(!!posterUri), [posterUri]);
  const { share, busy } = useRecapShare(cardRef, gate);

  // A stray link to a room that has no group pick: the sheet closes.
  useEffect(() => {
    if (view.status === 'closed' && router.canGoBack()) router.back();
  }, [view.status]);
  useEffect(() => {
    const node = titleRef.current ? findNodeHandle(titleRef.current) : null;
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  }, []);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setArea({ width, height });
  };
  const scale = previewScale(area.width, area.height);

  let body: React.ReactNode;
  if (view.status === 'ready') {
    const time = view.seconds === null ? null : formatRecapTime(view.seconds, t, i18n.language);
    const card = (onPosterSettled?: () => void) => (
      <RecapCard
        title={view.title}
        posterUri={view.posterUri}
        thumbhash={view.thumbhash}
        time={time}
        people={view.people}
        swipes={view.swipes}
        site={view.site}
        language={i18n.language}
        onPosterSettled={onPosterSettled}
      />
    );
    const people = t('a11y.people', { count: view.people });
    const swipes = t('a11y.swipes', { count: view.swipes });
    const label =
      time === null
        ? t('a11y.previewNoTime', { title: view.title, people, swipes })
        : t('a11y.preview', { title: view.title, time, people, swipes });
    body = (
      <>
        <View
          className="items-center justify-center overflow-hidden"
          style={{ width: CARD_WIDTH * scale, height: CARD_HEIGHT * scale }}
          accessible
          accessibilityRole="image"
          accessibilityLabel={label}
          testID="recap-preview"
        >
          <View
            className="absolute top-0 left-0"
            style={{ transform: [{ scale }], transformOrigin: 'top left' }}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
          >
            {card()}
          </View>
        </View>
        <View
          ref={cardRef}
          collapsable={false}
          pointerEvents="none"
          className="absolute top-0 -left-90"
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          testID="recap-capture"
        >
          {card(gate.markLoaded)}
        </View>
      </>
    );
  } else if (view.status === 'error') {
    body = (
      <EmptyState
        icon="alert"
        error
        title={t('errors.load')}
        action={{ label: tc('actions.retry'), onPress: view.retry }}
        autoFocus
      />
    );
  } else if (view.status === 'offline') {
    body = <EmptyState icon="wifi-off" title={t('errors.offline')} autoFocus />;
  } else {
    body = (
      <View accessible accessibilityLabel={t('a11y.loading')} testID="recap-loading">
        <Skeleton className="h-100 w-56 rounded-xl" />
      </View>
    );
  }

  return (
    <View
      className="flex-1 gap-4 bg-bg-canvas px-5 pt-5"
      style={{ paddingBottom: Math.max(insets.bottom, 16) }}
    >
      <View className="flex-row items-center justify-between">
        <View ref={titleRef} accessible accessibilityRole="header">
          <Text variant="title-l">{t('sheet.title')}</Text>
        </View>
        <IconButton
          icon="x"
          variant="plain"
          accessibilityLabel={tc('actions.close')}
          onPress={() => router.back()}
        />
      </View>
      <Text variant="body-s" tone="secondary">
        {t('sheet.body')}
      </Text>
      <View className="flex-1 items-center justify-center" onLayout={onLayout}>
        {body}
      </View>
      {view.status === 'ready' || view.status === 'loading' ? (
        <Button
          label={t('sheet.share')}
          accessibilityHint={t('a11y.shareHint')}
          variant="primary"
          size="l"
          icon="share"
          block
          loading={busy}
          disabled={view.status !== 'ready'}
          onPress={share}
        />
      ) : null}
    </View>
  );
}
