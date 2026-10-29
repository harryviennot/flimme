import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { cn } from '@/lib/cn';
import { haptics } from '@/lib/haptics';
import { msUntil } from '@/lib/server-time';

import { Icon } from './icon';
import { Text } from './text';

export type CountdownProps = {
  /** The server's deadline (ISO time). The clock is corrected for this phone's offset. */
  deadline: string;
  /** Called once when it reaches zero. */
  onEnd?: () => void;
  /** A soft haptic tick on each of the last 5 seconds. */
  tick?: boolean;
};

const format = (ms: number) => {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * The Final Cut's timer ("0:42"), as in the Figma's screen 15. Turns red for the last 10
 * seconds. Not in the Figma's library; built from its tokens.
 */
export function Countdown({ deadline, onEnd, tick = true }: CountdownProps) {
  const [left, setLeft] = useState(() => msUntil(deadline));
  const ended = useRef(false);
  const lastTick = useRef<number | null>(null);

  useEffect(() => {
    ended.current = false;
    const timer = setInterval(() => {
      const ms = msUntil(deadline);
      setLeft(ms);
      const seconds = Math.ceil(ms / 1000);
      if (tick && seconds > 0 && seconds <= 5 && lastTick.current !== seconds) {
        lastTick.current = seconds;
        haptics.countdown();
      }
      if (ms === 0 && !ended.current) {
        ended.current = true;
        onEnd?.();
      }
    }, 250);
    return () => clearInterval(timer);
  }, [deadline, onEnd, tick]);

  const urgent = left <= 10_000;
  return (
    <View
      accessibilityRole="timer"
      accessibilityLabel={format(left)}
      className={cn(
        'h-8 flex-row items-center gap-1.5 self-start rounded-pill border px-3',
        urgent ? 'border-nope-default bg-nope-soft' : 'border-marquee-default bg-marquee-soft',
      )}
    >
      <Icon name="clock" size={16} color={urgent ? 'nope-text' : 'marquee-default'} />
      <Text variant="mono-code" tone={urgent ? 'nope' : 'marquee'}>
        {format(left)}
      </Text>
    </View>
  );
}
