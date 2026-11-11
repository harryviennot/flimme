import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Chip } from '@/components/ui/chip';
import { SCROLL_PRESS_DELAY_MS } from '@/components/ui/pressable';
import { Skeleton } from '@/components/ui/skeleton';
import { layout } from '@/theme/motion';

export type GenreChipOption = { id: number; name: string; count: number };

export type GenreChipsProps = {
  /** Already sorted by name in the player's language. */
  options: readonly GenreChipOption[];
  selected: readonly number[];
  onToggle: (id: number) => void;
  /** Draw each genre's count of players (never who). Off for a lone player. */
  showCounts: boolean;
  /** Draw the skeleton row instead of the chips. */
  loading?: boolean;
  /**
   * `pick` (the default): a tap picks, with counts. `skip`: a tap skips (Not tonight), the chips
   * are red, never carry a count, and read "Skip Animation".
   */
  mode?: 'pick' | 'skip';
  /** Pick mode only: genres out tonight, drawn dashed and not pressable. Never says whose skip. */
  outTonight?: readonly number[];
};

const SKELETON_WIDTHS = ['w-20', 'w-24', 'w-20', 'w-24', 'w-20', 'w-24', 'w-20', 'w-24'] as const;

/** Tonight's genres as chips: the genre step and the lobby's genre sheet draw the same thing. */
export function GenreChips({
  options,
  selected,
  onToggle,
  showCounts,
  loading,
  mode = 'pick',
  outTonight = [],
}: GenreChipsProps) {
  const { t } = useTranslation('lobby');
  if (loading) {
    return (
      <View className="flex-row flex-wrap gap-2">
        {SKELETON_WIDTHS.map((width, n) => (
          <Skeleton key={n} className={`h-9 ${width} rounded-pill`} />
        ))}
      </View>
    );
  }
  return (
    <Animated.View
      entering={layout.fadeIn}
      accessibilityRole="list"
      className="flex-row flex-wrap gap-2"
    >
      {options.map((option) => {
        if (mode === 'skip') {
          return (
            <Chip
              key={option.id}
              label={option.name}
              tone="nope"
              accessibilityLabel={t('prefs.a11y.skipGenre', { name: option.name })}
              pressDelay={SCROLL_PRESS_DELAY_MS}
              selected={selected.includes(option.id)}
              onPress={() => onToggle(option.id)}
            />
          );
        }
        if (outTonight.includes(option.id)) {
          return (
            <Chip
              key={option.id}
              label={option.name}
              unavailable={t('prefs.outTonight')}
              accessibilityLabel={t('prefs.a11y.outTonight', { name: option.name })}
            />
          );
        }
        return (
          <Chip
            key={option.id}
            label={option.name}
            count={showCounts && option.count > 0 ? option.count : undefined}
            accessibilityLabel={
              showCounts
                ? t('genresSheet.chip', { name: option.name, count: option.count })
                : option.name
            }
            pressDelay={SCROLL_PRESS_DELAY_MS}
            selected={selected.includes(option.id)}
            onPress={() => onToggle(option.id)}
          />
        );
      })}
    </Animated.View>
  );
}
