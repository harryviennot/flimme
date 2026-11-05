import { useEffect, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { tokens } from '@/theme/generated/tokens';
import { spring } from '@/theme/motion';

import { Pressable } from './pressable';
import { Text } from './text';

export type Segment = { key: string; label: string };

export type SegmentedControlProps = {
  /** Two or three segments of equal width. */
  segments: readonly Segment[];
  selected: string;
  onSelect: (key: string) => void;
  /** What a screen reader calls the group. */
  accessibilityLabel?: string;
};

const PADDING = tokens.space[4];

/**
 * Switches between two or three lists, one at a time (My films: Liked and Seen). Not a `Chip`:
 * chips filter one list, segments swap it. The selected background slides (`spring.snappy`);
 * with Reduce Motion Reanimated makes it jump.
 */
export function SegmentedControl({
  segments,
  selected,
  onSelect,
  accessibilityLabel,
}: SegmentedControlProps) {
  const [width, setWidth] = useState(0);
  const index = Math.max(
    0,
    segments.findIndex((segment) => segment.key === selected),
  );
  const slot = width > 0 ? (width - PADDING * 2) / segments.length : 0;
  const x = useSharedValue(0);
  const placed = useSharedValue(false);

  useEffect(() => {
    if (slot === 0) return;
    // The first measure puts the thumb in place without sliding there from the left.
    if (placed.get()) x.set(withSpring(index * slot, spring.snappy));
    else {
      x.set(index * slot);
      placed.set(true);
    }
  }, [index, slot, x, placed]);

  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      className="flex-row rounded-md border border-border-default bg-bg-sunken p-1"
    >
      {slot > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[{ width: slot }, thumb]}
          className="absolute inset-y-1 left-1 rounded-sm border border-border-strong bg-bg-raised"
        />
      ) : null}
      {segments.map((segment) => {
        const isSelected = segment.key === selected;
        return (
          <Pressable
            key={segment.key}
            accessibilityRole="tab"
            accessibilityLabel={segment.label}
            accessibilityState={{ selected: isSelected }}
            haptic={isSelected ? false : 'press'}
            onPress={() => onSelect(segment.key)}
            className="min-h-10 flex-1 items-center justify-center rounded-sm px-2"
          >
            <Text
              variant="label-button-s"
              tone={isSelected ? 'primary' : 'secondary'}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
            >
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
