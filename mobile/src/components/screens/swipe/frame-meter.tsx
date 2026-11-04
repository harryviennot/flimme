import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import { addFrame, EMPTY_STATS, summarize, type FrameStats } from '@/features/dev/frame-meter';

// Dev only (`EXPO_PUBLIC_FRAME_METER=1`): records frame times on the UI thread while a card is
// dragged or flying, and shows the average fps and the share of janky frames. Strings here are
// not translated: it never ships on.

export function FrameMeter({
  dragging,
  flights,
  swipes,
}: {
  /** 1 while a finger is on the top card. */
  dragging: SharedValue<number>;
  /** Cards in the air. */
  flights: number;
  /** Answers given since the screen opened. */
  swipes: number;
}) {
  const stats = useSharedValue<FrameStats>(EMPTY_STATS);
  const flying = useSharedValue(0);
  const [text, setText] = useState('frame meter: swipe to measure');

  useEffect(() => {
    flying.set(flights);
  }, [flights, flying]);

  useFrameCallback((frame) => {
    'worklet';
    const moving = dragging.get() === 1 || flying.get() > 0;
    if (!moving || frame.timeSincePreviousFrame === null) return;
    stats.set(addFrame(stats.get(), frame.timeSincePreviousFrame));
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const current = stats.get();
      if (current.frames === 0) return;
      const { fps, jankyPercent } = summarize(current);
      const line = `fps ${fps.toFixed(1)} janky ${jankyPercent.toFixed(1)}% frames ${current.frames} swipes ${swipes}`;
      setText(line);
      console.log(`[frame-meter] ${line}`);
    }, 500);
    return () => clearInterval(timer);
  }, [stats, swipes]);

  return (
    <View pointerEvents="none" className="absolute right-0 bottom-0 left-0 items-center">
      <Text variant="mono-data" tone="muted" accessibilityLabel={text} testID="frame-meter">
        {text}
      </Text>
    </View>
  );
}
