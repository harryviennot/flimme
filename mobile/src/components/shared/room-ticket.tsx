import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';

import { Tag } from '@/components/ui/tag';
import { Text } from '@/components/ui/text';
import { tokens } from '@/theme/generated/tokens';
import { duration, layout, timing } from '@/theme/motion';

export type RoomTicketProps = {
  /** Six digits. Shown as "482 913". */
  code: string;
  /** "3 of 10 players" */
  leftDetail: string;
  /** "Host · Harry" */
  rightDetail: string;
  /** The host locked the room: a tag at the top right (host-menu.md#lock-room). */
  locked?: boolean;
  /** A closed room: the code dims and this label is stamped across it (closed.md). */
  stamp?: string;
};

/**
 * Figma "Room ticket": the room code as a cinema ticket, readable across a couch. The card does
 * not clip: the notches cover the border and bulge past the card edge, as in the Figma.
 */
export function RoomTicket({ code, leftDetail, rightDetail, locked, stamp }: RoomTicketProps) {
  const { t } = useTranslation();
  const spaced = code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
  return (
    <View className="self-stretch rounded-lg border border-marquee-strong bg-bg-surface elevation-card">
      {locked ? (
        <Animated.View
          entering={layout.fadeIn}
          exiting={layout.fadeOut}
          className="absolute top-3 right-3 z-10"
        >
          <Tag label={t('ticket.locked')} tone="neutral" icon="lock" />
        </Animated.View>
      ) : null}
      <View className="items-center gap-1 px-5 pt-5.5 pb-2">
        <Text variant="mono-eyebrow" tone="marquee">
          {t('ticket.roomCode')}
        </Text>
        {/* Tracking is added after the last digit too: pull it back so the code is centred. */}
        <View style={{ marginRight: -tokens.typography['display-ticket'].letterSpacing }}>
          <Text
            variant="display-ticket"
            tone={stamp ? 'disabled' : 'primary'}
            accessibilityLabel={code.split('').join(' ')}
          >
            {spaced}
          </Text>
        </View>
        {stamp ? (
          <View className="absolute inset-0 items-center justify-center pt-4" pointerEvents="none">
            <Stamp label={stamp} />
          </View>
        ) : null}
      </View>
      <View className="h-6 justify-center">
        <Svg height={2} width="100%">
          <Line
            x1="24"
            y1="1"
            x2="100%"
            y2="1"
            stroke={tokens.color['bg-sunken']}
            strokeWidth={2}
            strokeDasharray="6 6"
          />
        </Svg>
        <View className="absolute -left-3.25 size-6 rounded-pill border border-marquee-strong bg-bg-canvas" />
        <View className="absolute -right-3.25 size-6 rounded-pill border border-marquee-strong bg-bg-canvas" />
      </View>
      <View className="flex-row justify-between px-5 pt-2 pb-4.5">
        <Text variant="mono-data" tone="secondary">
          {leftDetail}
        </Text>
        <Text variant="mono-data" tone="secondary">
          {rightDetail}
        </Text>
      </View>
    </View>
  );
}

/** The closed room's stamp: lands once with the arcade overshoot, still under Reduce Motion. */
function Stamp({ label }: { label: string }) {
  const reduce = useReducedMotion();
  const land = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (!reduce) land.set(withDelay(duration.base, withTiming(1, timing.release)));
  }, [land, reduce]);
  const style = useAnimatedStyle(() => ({
    opacity: land.get(),
    transform: [
      { rotate: `${tokens.rotation['ticket-stamp']}deg` },
      { scale: 1.3 - 0.3 * land.get() },
    ],
  }));
  return (
    <Animated.View
      style={style}
      className="rounded-sm border-4 border-nope-default bg-bg-sunken px-3.5 pt-1 pb-0.5"
    >
      <Text variant="display-stamp" tone="nope">
        {label}
      </Text>
    </Animated.View>
  );
}
