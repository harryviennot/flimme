import { useEffect } from 'react';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { cn } from '@/lib/cn';
import { duration, easing } from '@/theme/motion';

export type SkeletonProps = {
  /** Size and shape: layout classes only, e.g. "h-6 w-40 rounded-sm". */
  className?: string;
};

/** A placeholder block that pulses while content loads. Still with Reduce Motion. */
export function Skeleton({ className }: SkeletonProps) {
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.set(
      withRepeat(
        withTiming(0.5, { duration: duration.celebrate, easing: easing.standard }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(opacity);
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={style} className={cn('rounded-sm bg-bg-raised', className)} />;
}
