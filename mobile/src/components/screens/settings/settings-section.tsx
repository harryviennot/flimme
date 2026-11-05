import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';

export type SettingsSectionProps = {
  /** The section's label, above the group. */
  label?: string;
  /** A helper line under the group. */
  helper?: string;
  children: ReactNode;
};

/** A group of rows on a surface, with an optional label above and helper below. */
export function SettingsSection({ label, helper, children }: SettingsSectionProps) {
  return (
    <View className="gap-2">
      {label ? (
        <View className="px-1" accessibilityRole="header">
          <Text variant="mono-eyebrow" tone="muted">
            {label}
          </Text>
        </View>
      ) : null}
      <View className="overflow-hidden rounded-lg border border-border-default bg-bg-surface">
        {children}
      </View>
      {helper ? (
        <Text variant="body-s" tone="muted" className="px-1">
          {helper}
        </Text>
      ) : null}
    </View>
  );
}
