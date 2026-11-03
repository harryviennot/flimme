import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { IconButton } from '@/components/ui/icon-button';
import { Pressable } from '@/components/ui/pressable';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import type { Greeting } from '@/features/home/greeting';
import { toAvatarColor } from '@/features/profile';

export type HomeHeaderProps = {
  greeting: Greeting;
  /** `null` while the profile isn't known yet. */
  profile: { displayName: string; avatarKey: string } | null;
};

/** The player's own corner: avatar, greeting and name (edit), and the settings button. */
export function HomeHeader({ greeting, profile }: HomeHeaderProps) {
  const { t } = useTranslation('home');
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Pressable
        accessibilityLabel={t('a11y.profile')}
        onPress={() => router.push('/name?edit=1')}
        className="flex-1 flex-row items-center gap-3"
      >
        <Avatar
          size="m"
          name={profile?.displayName ?? ''}
          color={toAvatarColor(profile?.avatarKey ?? '')}
        />
        <View className="flex-1 gap-1">
          <Text variant="mono-eyebrow" tone="secondary">
            {t(`greeting.${greeting}`)}
          </Text>
          {profile ? (
            <Text variant="title-l" numberOfLines={1}>
              {profile.displayName}
            </Text>
          ) : (
            <Skeleton className="h-6 w-32 rounded-sm" />
          )}
        </View>
      </Pressable>
      <IconButton
        icon="settings"
        accessibilityLabel={t('a11y.settings')}
        onPress={() => router.push('/settings')}
      />
    </View>
  );
}
