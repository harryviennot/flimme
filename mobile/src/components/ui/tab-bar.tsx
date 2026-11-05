import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from './icon';
import { Pressable } from './pressable';
import { Text } from './text';

export type TabBarItem = { key: string; label: string; icon: IconName };

export type TabBarProps = {
  items: readonly TabBarItem[];
  /** The key of the selected item. */
  selected: string;
  onSelect: (key: string) => void;
  /** The selected item was tapped again (the screen scrolls to the top). */
  onReselect?: (key: string) => void;
};

/**
 * The bar at the bottom of the home tabs (tab-bar.md): an icon and a label per item, the
 * selected one lit in marquee gold. It knows nothing about routes; the layout wires it.
 */
export function TabBar({ items, selected, onSelect, onReselect }: TabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      className="flex-row border-t border-border-default bg-bg-surface"
      style={{ paddingBottom: insets.bottom }}
    >
      {items.map((item) => {
        const isSelected = item.key === selected;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: isSelected }}
            onPress={() => (isSelected ? onReselect?.(item.key) : onSelect(item.key))}
            haptic={isSelected ? false : 'press'}
            className="min-h-14 flex-1 items-center justify-center gap-1 py-2"
          >
            <Icon
              name={item.icon}
              size={24}
              color={isSelected ? 'marquee-default' : 'text-muted'}
            />
            <Text
              variant="mono-eyebrow"
              tone={isSelected ? 'marquee' : 'muted'}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
