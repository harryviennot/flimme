import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  interpolate,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { GradientFill } from '@/components/ui/gradients';
import { Icon, type IconName } from '@/components/ui/icon';
import { Pressable } from '@/components/ui/pressable';
import { Tag, type TagTone } from '@/components/ui/tag';
import { Text } from '@/components/ui/text';
import {
  isLargeText,
  LOGO_SIZE,
  logoSlots,
  splitServices,
  synopsisFit,
} from '@/lib/card-back-layout';
import { cn } from '@/lib/cn';
import { serviceInitials } from '@/lib/service-initials';
import { tokens } from '@/theme/generated/tokens';
import { duration, spring, timing } from '@/theme/motion';

import { Poster, type PosterSource } from './poster';

// Figma "Movie card": the swipe card. Tapping flips it in place between the front (the
// poster, why it's here, title, meta, services) and the back (ratings, synopsis, credits,
// services, trailer). The LIKE, NOPE, SEEN IT and SUPER stamps show while it's dragged: each
// has a progress (0 to 1) that the swipe screen drives from the drag on the UI thread, or a
// fixed `stamp` for the gallery and the buttons.

export type StampKind = 'like' | 'nope' | 'seen' | 'super';

/** The stamp starts this share of its size and grows to full as the drag nears the line. */
const STAMP_SCALE_FROM = 0.6;

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
  /** A stamp shown at full, without a drag (the gallery). */
  stamp?: StampKind | null;
  /** Each stamp's progress while the card is dragged, driven on the UI thread (0 to 1). */
  stampProgress?: Partial<Record<StampKind, SharedValue<number>>>;
  /**
   * The bookmark (a solo like) low on the card's right, 44 points, front and back, the same spot. Not an answer: the card
   * stays and is still swiped. Without it there is no bookmark (the film sheet, the gallery).
   */
  bookmark?: {
    saved: boolean;
    onToggle: () => void;
    /** A touch started on the bookmark, so a card that flips on a tap can tell it apart. */
    onTouch?: () => void;
  };
  flipped?: boolean;
  /** Turns the card over. Without it the card is not pressable (the swipe screen's gesture flips). */
  onFlip?: () => void;
  /** A back that never turns over (the film sheet): no flip badge. */
  still?: boolean;
  back: {
    /** "2017 · 1 h 43": the year and the runtime. The score follows it, drawn from `tmdbRating`. */
    meta: string;
    /** The TMDB score, already formatted ("7,4"). It joins the meta line; none, no score. */
    tmdbRating?: string;
    synopsis: string;
    director?: string;
    cast?: string;
    /** The room's services for the film, by name and logo. Without it the front's `services` show. */
    services?: { name: string; logo?: string }[];
    /** Hidden in rooms with an age cap under 13 (security.md). */
    onTrailer?: () => void;
    /** A touch started on the Trailer button or "Read more", so a card that flips on a tap can tell it apart. */
    onControlTouch?: () => void;
    /** Opens the synopsis sheet, when the text is cut. Without it there is no "Read more". */
    onReadMore?: () => void;
  };
};

export function MovieCard(props: MovieCardProps) {
  const { title, flipped = false, onFlip } = props;
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const progress = useSharedValue(flipped ? 1 : 0);

  useEffect(() => {
    // Reanimated would skip a timing under Reduce Motion; the crossfade is what replaces the
    // turn, so it runs. A flip in either direction starts from where the card is now.
    progress.set(withTiming(flipped ? 1 : 0, { ...timing.flip, reduceMotion: ReduceMotion.Never }));
  }, [flipped, progress]);

  // Turning: the faces swap halfway, each hidden when it faces away. Reduce Motion: they crossfade.
  const front = useAnimatedStyle(() =>
    reduced
      ? { opacity: interpolate(progress.get(), [0, 1], [1, 0]) }
      : {
          transform: [
            { perspective: 1200 },
            { rotateY: `${interpolate(progress.get(), [0, 1], [0, 180])}deg` },
          ],
        },
  );
  const back = useAnimatedStyle(() =>
    reduced
      ? { opacity: interpolate(progress.get(), [0, 1], [0, 1]) }
      : {
          transform: [
            { perspective: 1200 },
            { rotateY: `${interpolate(progress.get(), [0, 1], [180, 360])}deg` },
          ],
        },
  );
  const faceStyle = reduced ? undefined : { backfaceVisibility: 'hidden' as const };

  const faces = (
    <>
      <Animated.View
        testID="movie-card-front"
        style={[front, faceStyle]}
        pointerEvents={flipped ? 'none' : 'auto'}
        className="absolute inset-0"
      >
        <Front {...props} />
      </Animated.View>
      <Animated.View
        testID="movie-card-back"
        style={[back, faceStyle]}
        pointerEvents={flipped ? 'auto' : 'none'}
        className="absolute inset-0"
      >
        <Back {...props} />
      </Animated.View>
    </>
  );

  return (
    <View className="w-full" style={{ aspectRatio: 345 / 518 }}>
      {onFlip ? (
        <Pressable
          accessibilityLabel={title}
          accessibilityHint={t('card.flipHint')}
          haptic={false}
          onPress={onFlip}
          className="flex-1"
        >
          {faces}
        </Pressable>
      ) : (
        <View className="flex-1">{faces}</View>
      )}
    </View>
  );
}

function Frame({
  children,
  border,
  rings,
}: {
  children: React.ReactNode;
  border: string;
  /** The 3-point colour borders drawn over the card's hairline (the stamps). */
  rings?: React.ReactNode;
}) {
  return (
    <View className="flex-1">
      <View
        className={cn('flex-1 overflow-hidden rounded-xl bg-bg-surface elevation-card', border)}
      >
        {children}
      </View>
      {rings}
    </View>
  );
}

const stampLook: Record<
  StampKind,
  { ring: string; box: string; tone: 'like' | 'nope' | 'accent' | 'marquee'; rotate: number }
> = {
  like: {
    ring: 'border-like-default',
    box: 'left-6 top-16 border-like-default',
    tone: 'like',
    rotate: -14,
  },
  nope: {
    ring: 'border-nope-default',
    box: 'right-6 top-16 border-nope-default',
    tone: 'nope',
    rotate: 14,
  },
  super: {
    ring: 'border-marquee-default',
    box: 'left-6 top-16 border-marquee-default',
    tone: 'marquee',
    rotate: -14,
  },
  seen: {
    ring: 'border-accent-default',
    box: 'inset-x-0 top-1/2 mx-auto self-center border-accent-default',
    tone: 'accent',
    rotate: 0,
  },
};
const STAMP_KINDS: StampKind[] = ['like', 'nope', 'super', 'seen'];

/**
 * The stamps and their coloured borders for each answer. With Reduce Motion the stamp shows at
 * full once the line is crossed, without growing.
 */
function useStamps({ stamp, stampProgress }: Pick<MovieCardProps, 'stamp' | 'stampProgress'>) {
  const one = useSharedValue(1);
  const zero = useSharedValue(0);
  if (!stamp && !stampProgress) return null;
  return STAMP_KINDS.map((kind) => ({
    kind,
    progress: stampProgress?.[kind] ?? (stamp === kind ? one : zero),
  }));
}

function Ring({ kind, progress }: { kind: StampKind; progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({ opacity: progress.get() }));
  return (
    <Animated.View
      pointerEvents="none"
      style={style}
      className={cn('absolute inset-0 rounded-xl border-3', stampLook[kind].ring)}
    />
  );
}

/**
 * A stamp's opacity for its progress. With Reduce Motion it does not fade in: the stamp, label
 * and all, shows still as soon as its coloured ring does (the ring alone says nothing).
 */
export function stampOpacity(progress: number, reduced: boolean): number {
  'worklet';
  if (reduced) return progress > 0 ? 1 : 0;
  return progress;
}

function Stamp({ kind, progress }: { kind: StampKind; progress: SharedValue<number> }) {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const look = stampLook[kind];
  const style = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      opacity: stampOpacity(p, reduced),
      transform: [
        { rotate: `${look.rotate}deg` },
        { scale: reduced ? 1 : interpolate(p, [0, 1], [STAMP_SCALE_FROM, 1]) },
      ],
    };
  });
  const label = {
    like: 'card.stampLike',
    nope: 'card.stampNope',
    seen: 'card.stampSeen',
    super: 'card.stampSuper',
  } as const;
  return (
    <Animated.View
      pointerEvents="none"
      style={style}
      className={cn(
        'absolute rounded-sm border-4 bg-bg-sunken px-3.5 pt-1 pb-0.5',
        look.box,
        kind === 'seen' && 'items-center',
      )}
    >
      <Text variant="display-stamp" tone={look.tone}>
        {t(label[kind])}
      </Text>
    </Animated.View>
  );
}

function FlipBadge({ icon }: { icon: IconName }) {
  return (
    <View className="absolute top-3.5 right-3.5 size-9 items-center justify-center rounded-pill bg-bg-sunken">
      <Icon name={icon} size={18} />
    </View>
  );
}

/** The bookmark: empty, or filled in the marquee colour once saved, with a small pop. */
function BookmarkBadge({ bookmark }: { bookmark: NonNullable<MovieCardProps['bookmark']> }) {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const { saved } = bookmark;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (saved && !reduced) {
      scale.set(0.8);
      scale.set(withSpring(1, spring.snappy));
    }
  }, [saved, reduced, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <View
      className="absolute right-5 bottom-3.5"
      onTouchStart={bookmark.onTouch}
      testID="movie-card-bookmark-wrap"
    >
      <Pressable
        accessibilityLabel={saved ? t('card.bookmarkRemove') : t('card.bookmarkSave')}
        accessibilityState={{ selected: saved }}
        onPress={bookmark.onToggle}
        testID="movie-card-bookmark"
      >
        <Animated.View
          style={style}
          className={cn(
            'size-11 items-center justify-center rounded-pill border bg-bg-sunken',
            saved ? 'border-marquee-default' : 'border-border-default',
          )}
        >
          <Icon
            name="bookmark"
            size={22}
            filled={saved}
            color={saved ? 'marquee-default' : 'text-primary'}
          />
        </Animated.View>
      </Pressable>
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

/** One service as a 32-point square, in the look of the service picker's tile. */
function LogoSquare({ name, logo }: { name: string; logo?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <View
      className="size-8 items-center justify-center overflow-hidden rounded-sm border border-border-default bg-bg-raised"
      testID="service-square"
    >
      {logo && !failed ? (
        // An expo-image sized only by className has no width on iOS: it gets a style.
        <Image
          source={{ uri: logo }}
          contentFit="cover"
          transition={duration.fast}
          style={{ width: LOGO_SIZE, height: LOGO_SIZE }}
          onError={() => setFailed(true)}
          accessible={false}
          testID="service-logo"
        />
      ) : (
        <Text variant="mono-eyebrow" tone="secondary" testID="service-initials">
          {serviceInitials(name)}
        </Text>
      )}
    </View>
  );
}

/**
 * The room's services as one row of logo squares, never wrapping. It holds as many as its measured
 * width allows; when they don't all fit, the last square is "+n" for the ones left out.
 */
function ServiceLogos({ services }: { services: { name: string; logo?: string }[] }) {
  const { t } = useTranslation();
  const [width, setWidth] = useState(0);
  const { shown, hidden } = splitServices(services, logoSlots(width));
  return (
    <View
      className="min-w-0 flex-1 flex-row gap-1.5 overflow-hidden"
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      testID="service-logos"
    >
      {shown.map(({ name, logo }) => (
        <LogoSquare key={name} name={name} logo={logo} />
      ))}
      {hidden > 0 ? (
        <View
          className="size-8 items-center justify-center rounded-sm border border-border-default bg-bg-raised"
          testID="service-more"
        >
          <Text variant="mono-eyebrow" tone="secondary" numberOfLines={1}>
            {t('card.moreServices', { count: hidden })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The meta line of the back: "2017 · 1 h 43 · ★ 7,4 TMDB". The score is a nested text, so the
 * star and the number take the marquee colour and the source stays quiet. No score: the line ends
 * after the runtime.
 */
export function CardMetaLine({
  meta,
  score,
  numberOfLines,
}: {
  meta: string;
  score?: string;
  numberOfLines?: number;
}) {
  const { t } = useTranslation();
  const text = score ? t('card.tmdbScore', { score }) : '';
  const cut = text.lastIndexOf(' ');
  return (
    <Text variant="mono-data" numberOfLines={numberOfLines}>
      {meta}
      {score ? (
        <>
          {meta ? ' · ' : ''}
          <Text variant="mono-data" tone="marquee">
            {cut > 0 ? text.slice(0, cut) : text}
          </Text>
          {cut > 0 ? (
            <Text variant="mono-data" tone="secondary">
              {text.slice(cut)}
            </Text>
          ) : null}
        </>
      ) : null}
    </Text>
  );
}

/**
 * The synopsis, cut with an ellipsis to the space the back leaves it: the back never scrolls
 * (a scroll would fight the swipe up). The line count comes from the room it has and the height
 * of one line, so it follows the text size. An invisible, unclipped copy counts the lines the
 * whole text needs: when it is cut, "Read more" takes the last line's place.
 */
function Synopsis({
  children,
  onReadMore,
  onControlTouch,
}: {
  children: string;
  onReadMore?: () => void;
  onControlTouch?: () => void;
}) {
  const { t } = useTranslation();
  const [room, setRoom] = useState(0);
  const [line, setLine] = useState(0);
  const [full, setFull] = useState(0);
  const { lines, cut } = synopsisFit({ room, line, full });
  return (
    <>
      <View
        className="min-h-0 flex-1 overflow-hidden"
        // Never less than one line: a sliver of a line reads as a bug, and one line plus
        // "Read more" is the least the back can show of the story.
        style={line > 0 ? { minHeight: line } : undefined}
        onLayout={(e: LayoutChangeEvent) => setRoom(e.nativeEvent.layout.height)}
      >
        <Text
          variant="body-m"
          numberOfLines={lines}
          onTextLayout={(e) => {
            const height = e.nativeEvent.lines[0]?.height;
            if (height) setLine(height);
          }}
        >
          {children}
        </Text>
        <Text
          variant="body-m"
          className="absolute inset-x-0 top-0 opacity-0"
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          testID="synopsis-measure"
          onTextLayout={(e) => setFull(e.nativeEvent.lines.length)}
        >
          {children}
        </Text>
      </View>
      {cut && onReadMore ? (
        // Outside the clipped box, so the link keeps its own line at any text size: the text
        // above it gives up the room (a cut stays a cut when the box shrinks).
        <View className="self-start" onTouchStart={onControlTouch}>
          <Pressable
            accessibilityLabel={t('card.readMore')}
            hitSlop={tokens.space[16]}
            onPress={onReadMore}
            testID="movie-card-read-more"
          >
            <Text variant="mono-eyebrow" tone="accent">
              {t('card.readMore')}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </>
  );
}

function Front({
  title,
  meta,
  poster,
  thumbhash,
  reason,
  services,
  stamp,
  stampProgress,
  bookmark,
}: MovieCardProps) {
  const stamps = useStamps({ stamp, stampProgress });
  // The stamp's 3-point colour border is drawn over the card's hairline, so the card's own
  // border (and everything placed inside it) never changes width when a stamp shows.
  return (
    <Frame
      border="border border-border-default"
      rings={stamps?.map(({ kind, progress }) => (
        <Ring key={kind} kind={kind} progress={progress} />
      ))}
    >
      <Poster source={poster} thumbhash={thumbhash} />
      <View className="absolute inset-x-0 bottom-0" style={{ height: '92%' }}>
        <GradientFill gradient="card-front-scrim" />
      </View>
      <FlipBadge icon="info" />
      <View className="absolute right-5 bottom-5 left-5 gap-2">
        {reason ? (
          <Tag label={reason.label} tone={reason.tone ?? 'accent'} icon={reason.icon ?? 'zap'} />
        ) : null}
        <Text variant="title-l" numberOfLines={3}>
          {title}
        </Text>
        <Text variant="mono-data" numberOfLines={2} className="pr-14">
          {meta}
        </Text>
        <View className="min-h-6 pr-14">
          <Services services={services} />
        </View>
      </View>
      {bookmark ? <BookmarkBadge bookmark={bookmark} /> : null}
      {stamps?.map(({ kind, progress }) => (
        <Stamp key={kind} kind={kind} progress={progress} />
      ))}
    </Frame>
  );
}

function Back({
  title,
  poster,
  thumbhash,
  services,
  back,
  still = false,
  stamp,
  stampProgress,
  bookmark,
}: MovieCardProps) {
  const { t } = useTranslation();
  const { fontScale } = useWindowDimensions();
  const large = isLargeText(fontScale);
  const stamps = useStamps({ stamp, stampProgress });
  const logos = back.services ?? services.map((name) => ({ name }));
  return (
    <Frame
      border="border border-border-default"
      rings={stamps?.map(({ kind, progress }) => (
        <Ring key={kind} kind={kind} progress={progress} />
      ))}
    >
      <View className="h-33 overflow-hidden">
        <Poster source={poster} thumbhash={thumbhash} />
        <View className="absolute inset-x-0 bottom-0" style={{ height: '92%' }}>
          <GradientFill gradient="card-front-scrim" />
        </View>
        {still ? null : <FlipBadge icon="refresh" />}
        {large ? null : (
          <View className="absolute right-16 bottom-4 left-5 gap-0.5">
            <Text variant="title-l" numberOfLines={1}>
              {title}
            </Text>
            <CardMetaLine meta={back.meta} score={back.tmdbRating} numberOfLines={2} />
          </View>
        )}
      </View>
      <View className="flex-1 gap-3 px-5 py-3.5">
        {large ? (
          <View className="gap-0.5" testID="movie-card-back-title">
            <Text variant="title-l" numberOfLines={2}>
              {title}
            </Text>
            <CardMetaLine meta={back.meta} score={back.tmdbRating} />
          </View>
        ) : null}
        <View className="min-h-0 flex-1 gap-1">
          <Text variant="mono-eyebrow" tone="secondary">
            {t('card.synopsis')}
          </Text>
          <Synopsis onReadMore={back.onReadMore} onControlTouch={back.onControlTouch}>
            {back.synopsis}
          </Synopsis>
        </View>
        <View className="gap-0.5">
          {back.director ? (
            <Text variant="body-s" tone="secondary" numberOfLines={1}>
              {t('card.director', { name: back.director })}
            </Text>
          ) : null}
          {back.cast ? (
            <Text variant="body-s" tone="secondary" numberOfLines={large ? 1 : 2}>
              {t('card.cast', { names: back.cast })}
            </Text>
          ) : null}
        </View>
        <View className="gap-1">
          {logos.length > 0 || back.onTrailer ? (
            <View className="flex-row items-center gap-1.5">
              {logos.length > 0 ? <ServiceLogos services={logos} /> : <View className="flex-1" />}
              {back.onTrailer ? (
                <View onTouchStart={back.onControlTouch}>
                  <Button
                    label={t('card.trailer')}
                    icon="play"
                    variant="secondary"
                    size="s"
                    onPress={back.onTrailer}
                  />
                </View>
              ) : null}
            </View>
          ) : null}
          {/* The last row: the credit, and the 44-point slot the bookmark lands in (M6.58). */}
          <View className="flex-row items-end gap-3">
            <View className="flex-1">
              {logos.length > 0 ? (
                <Text variant="body-s" tone="muted">
                  {t('card.justwatch')}
                </Text>
              ) : null}
            </View>
            <View className="size-11" testID="movie-card-bookmark-slot" />
          </View>
        </View>
      </View>
      {bookmark ? <BookmarkBadge bookmark={bookmark} /> : null}
      {stamps?.map(({ kind, progress }) => (
        <Stamp key={kind} kind={kind} progress={progress} />
      ))}
    </Frame>
  );
}
