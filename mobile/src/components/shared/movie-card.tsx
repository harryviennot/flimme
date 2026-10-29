import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Avatar, type AvatarColor } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { GradientFill } from '@/components/ui/gradients';
import { Icon, type IconName } from '@/components/ui/icon';
import { Pressable } from '@/components/ui/pressable';
import { Tag, type TagTone } from '@/components/ui/tag';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import { timing } from '@/theme/motion';

import { Poster, type PosterSource } from './poster';

// Figma "Movie card": the swipe card. Tapping flips it in place between the front (the
// poster, why it's here, title, meta, services) and the back (ratings, synopsis, credits,
// services, trailer). The LIKE and NOPE stamps show while it's dragged.

export type MovieCardProps = {
  title: string;
  /** "2021 · 1 h 52 · Drama · ★ 7.8", formatted by the caller. */
  meta: string;
  poster: PosterSource;
  thumbhash?: string;
  /** Why the card is here ("Because you all liked Neon Harbor"). */
  reason?: { label: string; icon?: IconName; tone?: TagTone };
  /** The room's services that have the film. */
  services: string[];
  /** The stamp while the card is dragged toward an answer. */
  stamp?: 'like' | 'nope' | null;
  flipped?: boolean;
  onFlip?: () => void;
  back: {
    tmdbRating?: string;
    /** A seated player's Letterboxd rating, when they have one. */
    friendRating?: { name: string; color: AvatarColor; rating: string };
    synopsis: string;
    director?: string;
    cast?: string;
    /** Hidden in rooms with an age cap under 13 (security.md). */
    onTrailer?: () => void;
  };
};

export function MovieCard(props: MovieCardProps) {
  const { title, flipped = false, onFlip } = props;
  const { t } = useTranslation();
  const progress = useSharedValue(flipped ? 1 : 0);

  useEffect(() => {
    progress.set(withTiming(flipped ? 1 : 0, timing.flip));
  }, [flipped, progress]);

  const front = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1200 },
      { rotateY: `${interpolate(progress.value, [0, 1], [0, 180])}deg` },
    ],
  }));
  const back = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1200 },
      { rotateY: `${interpolate(progress.value, [0, 1], [180, 360])}deg` },
    ],
  }));

  return (
    <View className="w-full" style={{ aspectRatio: 345 / 518 }}>
      <Pressable
        accessibilityLabel={title}
        accessibilityHint={t('card.flipHint')}
        haptic={false}
        onPress={onFlip}
        className="flex-1"
      >
        <Animated.View
          style={[front, { backfaceVisibility: 'hidden' }]}
          className="absolute inset-0"
        >
          <Front {...props} />
        </Animated.View>
        <Animated.View
          style={[back, { backfaceVisibility: 'hidden' }]}
          className="absolute inset-0"
        >
          <Back {...props} />
        </Animated.View>
      </Pressable>
    </View>
  );
}

function Frame({ children, border }: { children: React.ReactNode; border: string }) {
  return (
    <View className={cn('flex-1 overflow-hidden rounded-xl bg-bg-surface elevation-card', border)}>
      {children}
    </View>
  );
}

function FlipBadge({ icon }: { icon: IconName }) {
  return (
    <View className="absolute top-3.5 right-3.5 size-9 items-center justify-center rounded-pill bg-bg-sunken">
      <Icon name={icon} size={18} />
    </View>
  );
}

function Services({ services }: { services: string[] }) {
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {services.map((service) => (
        <Tag key={service} label={service} />
      ))}
    </View>
  );
}

function Front({ title, meta, poster, thumbhash, reason, services, stamp }: MovieCardProps) {
  const { t } = useTranslation();
  const border =
    stamp === 'like'
      ? 'border-3 border-like-default'
      : stamp === 'nope'
        ? 'border-3 border-nope-default'
        : 'border border-border-default';
  return (
    <Frame border={border}>
      <Poster source={poster} thumbhash={thumbhash} />
      <View className="absolute inset-x-0 bottom-0" style={{ height: '64%' }}>
        <GradientFill gradient="card-scrim" />
      </View>
      <FlipBadge icon="info" />
      <View className="absolute right-5 bottom-5 left-5 gap-2">
        {reason ? (
          <Tag label={reason.label} tone={reason.tone ?? 'accent'} icon={reason.icon ?? 'zap'} />
        ) : null}
        <Text variant="title-l">{title}</Text>
        <Text variant="mono-data" tone="secondary">
          {meta}
        </Text>
        <Services services={services} />
      </View>
      {stamp ? (
        <View
          className={cn(
            'absolute top-10 rounded-sm border-4 bg-bg-sunken px-3.5 pt-1 pb-0.5',
            stamp === 'like' ? 'left-6 border-like-default' : 'right-6 border-nope-default',
          )}
          style={{ transform: [{ rotate: stamp === 'like' ? '-14deg' : '14deg' }] }}
        >
          <Text variant="display-stamp" tone={stamp === 'like' ? 'like' : 'nope'}>
            {t(stamp === 'like' ? 'card.stampLike' : 'card.stampNope')}
          </Text>
        </View>
      ) : null}
    </Frame>
  );
}

function Back({ title, meta, poster, thumbhash, services, back }: MovieCardProps) {
  const { t } = useTranslation();
  return (
    <Frame border="border border-border-default">
      <View className="h-33 overflow-hidden">
        <View className="absolute inset-x-0 -top-5" style={{ aspectRatio: 345 / 518 }}>
          <Poster source={poster} thumbhash={thumbhash} />
        </View>
        <GradientFill gradient="card-scrim" />
        <FlipBadge icon="refresh" />
        <View className="absolute right-16 bottom-4 left-5 gap-0.5">
          <Text variant="title-l" numberOfLines={1}>
            {title}
          </Text>
          <Text variant="mono-data" tone="secondary" numberOfLines={1}>
            {meta}
          </Text>
        </View>
      </View>
      <View className="flex-1 gap-3 px-5 py-3.5">
        <View className="flex-row gap-2.5">
          {back.tmdbRating ? (
            <View className="flex-1 gap-0.5 rounded-md bg-bg-raised px-3 py-2.5">
              <View className="flex-row items-center gap-2">
                <Icon name="star" size={22} color="marquee-default" />
                <Text variant="display-m" tone="marquee">
                  {back.tmdbRating}
                </Text>
              </View>
              <Text variant="mono-data" tone="muted">
                {t('card.tmdbRating')}
              </Text>
            </View>
          ) : null}
          {back.friendRating ? (
            <View className="flex-1 gap-0.5 rounded-md bg-bg-raised px-3 py-2.5">
              <View className="flex-row items-center gap-2">
                <Avatar name={back.friendRating.name} color={back.friendRating.color} />
                <Text variant="display-m">
                  {t('card.stars', { rating: back.friendRating.rating })}
                </Text>
              </View>
              <Text variant="mono-data" tone="muted" numberOfLines={1}>
                {t('card.letterboxdRating', { name: back.friendRating.name })}
              </Text>
            </View>
          ) : null}
        </View>
        <View className="gap-1">
          <Text variant="mono-eyebrow" tone="secondary">
            {t('card.synopsis')}
          </Text>
          <Text variant="body-m" numberOfLines={5}>
            {back.synopsis}
          </Text>
        </View>
        <View className="gap-0.5">
          {back.director ? (
            <Text variant="body-s" tone="secondary" numberOfLines={1}>
              {t('card.director', { name: back.director })}
            </Text>
          ) : null}
          {back.cast ? (
            <Text variant="body-s" tone="secondary" numberOfLines={1}>
              {t('card.cast', { names: back.cast })}
            </Text>
          ) : null}
        </View>
        <View className="flex-row items-center gap-1.5">
          <View className="flex-1">
            <Services services={services} />
          </View>
          {back.onTrailer ? (
            <Button
              label={t('card.trailer')}
              icon="play"
              variant="secondary"
              size="s"
              onPress={back.onTrailer}
            />
          ) : null}
        </View>
        <View className="flex-1 justify-end">
          <Text variant="mono-eyebrow" tone="muted" align="center">
            {t('card.flipBack')}
          </Text>
        </View>
      </View>
    </Frame>
  );
}
