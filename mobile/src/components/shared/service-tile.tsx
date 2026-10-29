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

/** Figma "Service tile": a streaming service the player has, or can tap to add. */
export function ServiceTile({ name, selected = false, onPress }: ServiceTileProps) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityLabel={name}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      className={cn(
        'w-27 gap-1 rounded-md p-3',
        selected
          ? 'border-2 border-accent-default bg-accent-soft'
          : 'border border-border-default bg-bg-surface',
      )}
    >
      <View className="flex-row items-center justify-between">
        <Text variant="title-m" numberOfLines={1} className="flex-1">
          {name}
        </Text>
        {selected ? <Icon name="check" size={16} color="accent-text" /> : null}
      </View>
      <Text variant="body-s" tone={selected ? 'accent' : 'muted'}>
        {t(selected ? 'services.youHaveIt' : 'services.tapToAdd')}
      </Text>
    </Pressable>
  );
}
