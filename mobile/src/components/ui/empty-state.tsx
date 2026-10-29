import { View } from 'react-native';

import { Button } from './button';
import { Icon, type IconName } from './icon';
import { Text } from './text';

export type EmptyStateProps = {
  icon: IconName;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void };
  /** An error rather than an empty list: the icon turns red. */
  error?: boolean;
};

/**
 * Nothing to show, or something failed: an icon, a title, a line of explanation and at
 * most one action. Every list and screen uses this instead of its own. Not in the
 * Figma's library; built from its tokens and screen 26 ("Nothing left").
 */
export function EmptyState({ icon, title, body, action, error = false }: EmptyStateProps) {
  return (
    <View className="items-center gap-3 px-6 py-10">
      <View className="size-16 items-center justify-center rounded-pill bg-bg-raised">
        <Icon name={icon} size={28} color={error ? 'nope-text' : 'text-secondary'} />
      </View>
      <Text variant="display-s" align="center">
        {title}
      </Text>
      {body ? (
        <Text variant="body-m" tone="secondary" align="center">
          {body}
        </Text>
      ) : null}
      {action ? (
        <View className="mt-2">
          <Button label={action.label} onPress={action.onPress} variant="secondary" size="s" />
        </View>
      ) : null}
    </View>
  );
}
