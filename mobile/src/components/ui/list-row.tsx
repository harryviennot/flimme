import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Icon, type IconName } from './icon';
import { Pressable } from './pressable';
import { Text } from './text';

export type ListRowProps = {
  label: string;
  icon?: IconName;
  /** The current value, on the right ("English"). */
  value?: string;
  /** Something on the right instead of the value and chevron (a Toggle). */
  trailing?: ReactNode;
  /** Makes the row tappable and shows a chevron. */
  onPress?: () => void;
};

/** Figma "List row": a settings or profile row inside a grouped surface. */
export function ListRow({ label, icon, value, trailing, onPress }: ListRowProps) {
  const content = (
    <>
      {icon ? <Icon name={icon} size={20} color="text-secondary" /> : null}
      <Text variant="body-l" className="flex-1" numberOfLines={1}>
        {label}
      </Text>
      {trailing ?? (
        <>
          {value ? (
            <Text variant="body-m" tone="muted" numberOfLines={1}>
              {value}
            </Text>
          ) : null}
          {onPress ? <Icon name="chevron-right" size={18} color="text-muted" /> : null}
        </>
      )}
    </>
  );
  const row = 'h-14 flex-row items-center gap-3.5 border-b border-border-subtle px-4';
  return onPress ? (
    <Pressable
      accessibilityLabel={value ? `${label}, ${value}` : label}
      onPress={onPress}
      className={`${row} active:bg-bg-raised`}
    >
      {content}
    </Pressable>
  ) : (
    <View className={row}>{content}</View>
  );
}
