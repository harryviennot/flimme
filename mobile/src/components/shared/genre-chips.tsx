import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Chip } from '@/components/ui/chip';
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
};

const SKELETON_WIDTHS = ['w-20', 'w-24', 'w-20', 'w-24', 'w-20', 'w-24', 'w-20', 'w-24'] as const;

/** Tonight's genres as chips: the genre step and the lobby's genre sheet draw the same thing. */
export function GenreChips({ options, selected, onToggle, showCounts, loading }: GenreChipsProps) {
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
        const counted = showCounts;
        return (
          <Chip
            key={option.id}
            label={option.name}
            count={counted && option.count > 0 ? option.count : undefined}
            accessibilityLabel={
              counted
                ? t('genresSheet.chip', { name: option.name, count: option.count })
                : option.name
            }
            selected={selected.includes(option.id)}
            onPress={() => onToggle(option.id)}
          />
        );
      })}
    </Animated.View>
  );
}
