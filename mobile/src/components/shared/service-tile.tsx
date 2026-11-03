import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Pressable } from '@/components/ui/pressable';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';

export type ServiceTileProps = {
  name: string;
  selected?: boolean;
  onPress?: () => void;
};

/**
 * Figma "Service tile": a streaming service the player has, or can tap to add. It fills the
 * width of its cell: put it in a row (three per row, `flex-row gap-2`), never a column.
 */
export function ServiceTile({ name, selected = false, onPress }: ServiceTileProps) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityLabel={name}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      className={cn(
        // Fills the width its grid cell gives it (three per row, 106 points on a 375-wide
        // iPhone). The unselected border is 1 point and the selected 2: the padding makes
        // up the difference, so both are the same height.
        'min-w-0 flex-1 gap-1 rounded-md',
        selected
          ? 'border-2 border-accent-default bg-accent-soft p-2.5'
          : 'border border-border-default bg-bg-surface p-2.75',
      )}
    >
      <Text variant="title-m" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {name}
      </Text>
      {/* The check sits beside "Added", not on the name line: names keep the full width. */}
      <View className="flex-row items-center gap-1">
        {selected ? <Icon name="check" size={16} color="accent-text" /> : null}
        <Text
          variant="body-s"
          tone={selected ? 'accent' : 'muted'}
          numberOfLines={1}
          className="shrink"
        >
          {t(selected ? 'services.added' : 'services.tapToAdd')}
        </Text>
      </View>
    </Pressable>
  );
}
