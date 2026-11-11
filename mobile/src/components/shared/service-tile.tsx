import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Pressable, SCROLL_PRESS_DELAY_MS } from '@/components/ui/pressable';
import { Text } from '@/components/ui/text';
import { serviceInitials } from '@/lib/service-initials';
import { cn } from '@/lib/cn';
import { duration } from '@/theme/motion';

export type ServiceTileProps = {
  name: string;
  /** The logo's full address (TMDB, w92). Without it, or when it fails to load, the initials show. */
  logo?: string;
  selected?: boolean;
  onPress?: () => void;
};

/**
 * Figma "Service tile": a streaming service the player has, or can tap to add. A square with
 * the logo; the name is the accessibility label, not text (four tiles a row leave no room for
 * it, and the logos are what players know). It fills the width of its cell: put it in a row
 * (`flex-row gap-2`), never a column. Selected: accent border and a check badge. Unselected:
 * the logo is dimmed, so the state never rests on colour alone.
 */
export function ServiceTile({ name, logo, selected = false, onPress }: ServiceTileProps) {
  const [failed, setFailed] = useState(false);
  const showLogo = Boolean(logo) && !failed;
  return (
    <Pressable
      accessibilityLabel={name}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      // The grid sits in a scroll or a sheet: a drag that starts here must not tick.
      unstable_pressDelay={SCROLL_PRESS_DELAY_MS}
      className={cn(
        'aspect-square min-w-0 flex-1 overflow-hidden rounded-md',
        selected ? 'border-2 border-accent-default' : 'border border-border-default',
      )}
    >
      <View
        className={cn(
          'flex-1 items-center justify-center bg-bg-raised',
          selected ? '' : 'opacity-stack-near',
        )}
      >
        {showLogo ? (
          <Image
            source={{ uri: logo }}
            contentFit="cover"
            transition={duration.fast}
            style={StyleSheet.absoluteFill}
            accessible={false}
            onError={() => setFailed(true)}
            testID="service-tile-logo"
          />
        ) : (
          <Text variant="title-m" tone="secondary" testID="service-tile-initials">
            {serviceInitials(name)}
          </Text>
        )}
      </View>
      {selected ? (
        <View
          className="absolute top-1 right-1 size-5 items-center justify-center rounded-pill bg-accent-default"
          testID="service-tile-check"
        >
          <Icon name="check" size={14} color="text-on-accent" />
        </View>
      ) : null}
    </Pressable>
  );
}
