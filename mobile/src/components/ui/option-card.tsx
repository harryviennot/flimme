import { View } from 'react-native';

import { cn } from '@/lib/cn';

import { Icon, type IconName } from './icon';
import { Pressable } from './pressable';
import { Text } from './text';

export type OptionCardProps = {
  title: string;
  description: string;
  icon: IconName;
  selected?: boolean;
  onPress?: () => void;
};

/** Figma "Option card": a radio-style card for one choice among a few (the game mode). */
export function OptionCard({
  title,
  description,
  icon,
  selected = false,
  onPress,
}: OptionCardProps) {
  return (
    <Pressable
      accessibilityLabel={title}
      accessibilityHint={description}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn(
        'flex-row items-center gap-3.5 self-stretch rounded-lg p-4',
        selected
          ? 'border-2 border-accent-default bg-accent-soft'
          : 'border border-border-default bg-bg-surface',
      )}
    >
      <View
        className={cn(
          'size-11 items-center justify-center rounded-md',
          selected ? 'bg-accent-default' : 'bg-bg-raised',
        )}
      >
        <Icon name={icon} size={22} color={selected ? 'text-on-accent' : 'text-primary'} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text variant="title-m">{title}</Text>
        <Text variant="body-s" tone="secondary">
          {description}
        </Text>
      </View>
      <View
        className={cn(
          'size-5.5 items-center justify-center rounded-pill',
          selected ? 'bg-accent-default' : 'border-2 border-border-control',
        )}
      >
        {selected ? <Icon name="check" size={14} color="text-on-accent" strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}
