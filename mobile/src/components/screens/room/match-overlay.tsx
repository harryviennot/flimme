import { useEffect, useRef, type ComponentRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  BackHandler,
  findNodeHandle,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Poster, type PosterSource } from '@/components/shared/poster';
import { Avatar, type AvatarColor } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { GradientFill } from '@/components/ui/gradients';
import { MarqueeBulbs } from '@/components/ui/marquee-bulbs';
import { Pressable } from '@/components/ui/pressable';
import { Text } from '@/components/ui/text';
import { formatList } from '@/features/lobby/names';
import { duration, layout, spring, timing } from '@/theme/motion';

// "It's a match" (match.md): the whole room celebrates one film at the same second. It shows
// the poster, the count and every seated player's avatar with no marks, never who said yes.

export type MatchPlayer = { id: string; name: string; color: AvatarColor };

export type MatchOverlayProps = {
  /** The film, once the phone has its card; until then the poster's placeholder shows. */
  film: { title: string; meta: string } | null;
  poster: PosterSource | null;
  thumbhash?: string;
  /** From the `match` event or the re-read; null until one has come. */
  count: { likes: number; of: number } | null;
  /** Every seated player who hasn't left, in seat order. */
  players: readonly MatchPlayer[];
  language: string;
  /** A tap, the button or Android's back. The caller ignores the first 800 ms. */
  onContinue: () => void;
};

// The poster starts at about the swipe card's width: the screen less its 20-point margins.
const CARD_MARGIN = 40;

export function MatchOverlay({
  film,
  poster,
  thumbhash,
  count,
  players,
  language,
  onContinue,
}: MatchOverlayProps) {
  const { t } = useTranslation('match');
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const title = useRef<ComponentRef<typeof View>>(null);

  const countText = count
    ? t(count.likes === count.of ? 'count.unanimous' : 'count.majority', count)
    : '';
  const announce = t('a11y.announce', { title: film?.title ?? '', count: countText }).trim();

  // The overlay takes screen reader focus and reads the match.
  useEffect(() => {
    const node = title.current ? findNodeHandle(title.current) : null;
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
    AccessibilityInfo.announceForAccessibility(announce);
    // Once, when it appears; later changes (the count arriving) are read through the elements.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onContinue();
      return true;
    });
    return () => subscription.remove();
  }, [onContinue]);

  // The poster scales from card size to full screen; with Reduce Motion it fades in instead.
  const scale = useSharedValue(reduced ? 1 : (width - CARD_MARGIN) / width);
  const opacity = useSharedValue(reduced ? 0 : 1);
  useEffect(() => {
    if (reduced) opacity.set(withTiming(1, timing.base));
    else scale.set(withTiming(1, timing.celebrate));
  }, [reduced, scale, opacity]);
  const posterStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ scale: scale.get() }],
  }));

  const landing = reduced ? 0 : duration.celebrate;
  const stagger = (index: number) => (reduced ? 0 : index * duration.instant);
  const lateIn = FadeIn.duration(duration.base).delay(landing + stagger(players.length));
  const avatarIn = (index: number) =>
    reduced
      ? FadeIn.duration(duration.base)
      : ZoomIn.delay(landing + stagger(index))
          .springify()
          .damping(spring.bouncy.damping)
          .stiffness(spring.bouncy.stiffness)
          .mass(spring.bouncy.mass);

  const names = formatList(
    players.map((player) => player.name),
    language,
  );

  return (
    <Animated.View
      entering={FadeIn.duration(duration.fast)}
      exiting={layout.fadeOut}
      accessibilityViewIsModal
      className="absolute inset-0 bg-overlay-scrim"
      testID="match-overlay"
    >
      <Animated.View style={[StyleSheet.absoluteFill, posterStyle]} className="bg-bg-canvas">
        {poster ? <Poster source={poster} thumbhash={thumbhash} /> : null}
        <View className="absolute inset-0 bg-overlay-scrim" pointerEvents="none" />
        <View className="absolute inset-x-0 bottom-0 h-3/5" pointerEvents="none">
          <GradientFill gradient="card-scrim" />
        </View>
      </Animated.View>

      {/* A tap anywhere goes on. It is under the content, so the button and the rest stay put. */}
      <Pressable
        accessibilityLabel={t('cta')}
        haptic={false}
        onPress={onContinue}
        className="absolute inset-0"
        importantForAccessibility="no"
        accessibilityElementsHidden
        testID="match-tap"
      />

      <View
        pointerEvents="box-none"
        className="flex-1 justify-between"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <View className="items-center gap-3 px-5 pt-6" pointerEvents="none">
          <MarqueeBulbs count={16} chasing={!reduced} />
          <Animated.View
            ref={title}
            entering={reduced ? FadeIn.duration(duration.base) : layout.popIn.delay(duration.slow)}
            accessible
            accessibilityRole="header"
            accessibilityLiveRegion="assertive"
            accessibilityLabel={announce}
            className="glow-marquee"
          >
            <Text variant="display-l" tone="marquee" align="center" numberOfLines={2}>
              {t('title')}
            </Text>
          </Animated.View>
        </View>

        <View className="gap-3 px-5 pb-5" pointerEvents="box-none">
          <View
            className="flex-row"
            accessible
            accessibilityLabel={t('a11y.avatars', { names })}
            pointerEvents="none"
          >
            {players.map((player, index) => (
              <Animated.View key={player.id} entering={avatarIn(index)}>
                <Avatar name={player.name} color={player.color} size="m" overlap={index > 0} />
              </Animated.View>
            ))}
          </View>

          <Animated.View entering={lateIn} className="gap-1" pointerEvents="none">
            {countText ? (
              <Text variant="title-m" tone="marquee">
                {countText}
              </Text>
            ) : null}
            {film ? (
              <>
                <Text variant="title-l">{film.title}</Text>
                {film.meta ? (
                  <Text variant="mono-data" tone="secondary">
                    {film.meta}
                  </Text>
                ) : null}
              </>
            ) : null}
          </Animated.View>

          <Animated.View entering={lateIn}>
            <Button
              label={t('cta')}
              accessibilityLabel={t('a11y.cta', { title: film?.title ?? '' })}
              variant="marquee"
              size="l"
              icon="tv"
              block
              onPress={onContinue}
            />
          </Animated.View>
        </View>
      </View>
    </Animated.View>
  );
}
