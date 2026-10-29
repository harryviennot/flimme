import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { cn } from '@/lib/cn';
import type { ColorToken } from '@/theme/generated/tokens';
import { layout } from '@/theme/motion';

import { Icon, type IconName } from './icon';
import { Text } from './text';

export type BannerTone = 'warn' | 'info';

const tones: Record<BannerTone, { bg: string; icon: IconName; color: ColorToken }> = {
  warn: { bg: 'bg-marquee-soft border-marquee-strong', icon: 'wifi-off', color: 'marquee-default' },
  info: { bg: 'bg-accent-soft border-accent-pressed', icon: 'info', color: 'accent-text' },
};

export type BannerProps = { message: string; tone?: BannerTone };

/**
 * A strip across the top of a room screen while something is off: "Reconnecting",
 * "Offline: 6 swipes waiting". Not in the Figma's library; built from its tokens.
 */
export function Banner({ message, tone = 'warn' }: BannerProps) {
  const look = tones[tone];
  return (
    <Animated.View entering={layout.fadeIn} exiting={layout.fadeOut}>
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        className={cn('flex-row items-center justify-center gap-2 border-b px-4 py-2', look.bg)}
      >
        <Icon name={look.icon} size={16} color={look.color} />
        <Text variant="mono-data" tone={tone === 'warn' ? 'marquee' : 'accent'}>
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}
