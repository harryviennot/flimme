import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Text } from '@/components/ui/text';
import type { JoinHost } from '@/features/join/use-join-link';
import { cn } from '@/lib/cn';

/**
 * Whose room it is and how many are in, from the preview (join-sheet.md#layout). Read as one
 * element; with no host name there is no avatar (it needs an initial), only the count.
 */
export function HostLine({ host, centered }: { host: JoinHost; centered?: boolean }) {
  const { t } = useTranslation('join');
  const { name, color, players } = host;
  return (
    <View
      accessible
      accessibilityLabel={
        name ? t('a11y.hostLine', { name, count: players }) : t('link.players', { count: players })
      }
      className={cn('flex-row items-center gap-3', centered ? 'justify-center' : 'justify-start')}
    >
      {name ? <Avatar name={name} color={color} size="m" /> : null}
      <Text variant="body-m" tone="secondary">
        {t('link.players', { count: players })}
      </Text>
    </View>
  );
}
