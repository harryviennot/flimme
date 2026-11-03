import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { LinkRow } from '@/components/screens/invite/link-row';
import { QrPanel } from '@/components/screens/invite/qr-panel';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { Icon } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { useRoomLock } from '@/features/lobby/use-room-lock';
import { useMySeat } from '@/features/room';
import { cn } from '@/lib/cn';
import { layout } from '@/theme/motion';
import Animated from 'react-native-reanimated';
import { displayLink, useInvite } from '@/features/invite/invite-link';

export default function RoomInviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation('lobby');
  const { t: tc } = useTranslation('common');
  const invite = useInvite(id);
  const lock = useRoomLock(id);
  const isHost = useMySeat(id)?.role === 'host';
  const ready = invite.state === 'ready' && invite.link !== undefined;

  return (
    <Screen>
      <View className="items-end pt-3">
        <IconButton
          icon="x"
          variant="plain"
          accessibilityLabel={tc('actions.close')}
          onPress={() => router.back()}
        />
      </View>
      <View className="items-center gap-6 pt-2">
        <View accessible accessibilityRole="header">
          <Text variant="display-s" align="center">
            {t('invite.title')}
          </Text>
        </View>
        {invite.state === 'error' ? (
          <EmptyState
            icon="alert"
            error
            title={t('invite.error')}
            action={{ label: tc('actions.retry'), onPress: invite.retry }}
          />
        ) : ready ? (
          <>
            <View className={cn(lock.locked && 'opacity-disabled')}>
              <QrPanel link={invite.link ?? ''} />
            </View>
            <View className={cn('w-full', lock.locked && 'opacity-disabled')}>
              <LinkRow display={displayLink(invite.link ?? '')} onCopy={() => void invite.copy()} />
            </View>
          </>
        ) : (
          <>
            <Skeleton className="size-52 rounded-lg" />
            <Skeleton className="h-16 w-full rounded-md" />
          </>
        )}
        {lock.locked ? (
          <Animated.View entering={layout.fadeIn} className="items-center gap-3">
            <View className="flex-row items-center gap-2">
              <Icon name="lock" size={16} color="marquee-default" />
              <Text variant="body-s" tone="marquee" align="center">
                {isHost ? t('invite.locked') : t('invite.lockedGuest')}
              </Text>
            </View>
            {isHost ? (
              <Button
                label={t('invite.unlock')}
                icon="lock"
                variant="secondary"
                size="s"
                disabled={lock.disabled}
                onPress={() => void lock.set(false)}
              />
            ) : null}
          </Animated.View>
        ) : (
          <Text variant="body-s" tone="muted" align="center">
            {t('invite.helper')}
          </Text>
        )}
        <Button
          label={t('invite.share')}
          icon="share"
          disabled={!ready}
          onPress={() => void invite.share()}
        />
      </View>
    </Screen>
  );
}
