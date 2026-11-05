import { router } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Platform, ScrollView, View } from 'react-native';

import { PlayerPill } from '@/components/shared/player-pill';
import { IconButton } from '@/components/ui/icon-button';
import { useAskToLeave } from '@/features/lobby/leave-context';
import { toAvatarColor } from '@/features/profile';
import { useMySeat, useRoomPresence, useRoomSeats } from '@/features/room';
import { doneNames, pillsFor } from '@/features/swipe/pills';

import { Shortlist } from './shortlist';

// The top bar (swipe.md#the-top-bar): Leave, the player pills and, through a tap on a pill, the
// seat sheet (Remove for the host, Report for everyone), then the room's shortlist. Never
// anything about answers.
export function SwipeTopBar({
  roomId,
  count,
  done,
}: {
  roomId: string;
  /** This phone's exact number of answers. */
  count: number;
  /** This phone has no cards left. */
  done: boolean;
}) {
  const { t } = useTranslation('swipe');
  const { t: tl } = useTranslation('lobby');
  const askToLeave = useAskToLeave();
  const seats = useRoomSeats(roomId).data;
  const me = useMySeat(roomId);
  const { online, away, progress } = useRoomPresence(roomId);

  const pills = useMemo(
    () =>
      pillsFor({
        seats,
        online,
        away,
        progress,
        myId: me?.member_id,
        myCount: count,
        myDone: done,
      }),
    [seats, online, away, progress, me?.member_id, count, done],
  );

  // A pill turning "Done" is said once, politely; the first read says nothing.
  const told = useRef<Set<string> | null>(null);
  const finished = doneNames(pills);
  useEffect(() => {
    const before = told.current;
    told.current = new Set(finished);
    if (!before || Platform.OS !== 'ios') return;
    for (const name of finished) {
      if (!before.has(name)) AccessibilityInfo.announceForAccessibility(t('a11y.done', { name }));
    }
  }, [finished.join('\u0000'), t]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View className="flex-row items-center gap-2 px-5 pt-2 pb-2">
      <IconButton icon="x" accessibilityLabel={tl('a11y.leave')} onPress={askToLeave} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="items-center gap-2"
      >
        {pills.map((pill) => (
          <PlayerPill
            key={pill.memberId}
            name={pill.name}
            color={toAvatarColor(pill.avatarKey)}
            count={pill.count}
            online={pill.online}
            away={pill.away}
            done={pill.done}
            isHost={pill.isHost}
            isMe={pill.isMe}
            hint={pill.isMe ? undefined : tl('a11y.seat', { name: pill.name })}
            onPress={
              pill.isMe ? undefined : () => router.push(`/room/${roomId}/seat/${pill.memberId}`)
            }
          />
        ))}
      </ScrollView>
      <Shortlist roomId={roomId} />
    </View>
  );
}
