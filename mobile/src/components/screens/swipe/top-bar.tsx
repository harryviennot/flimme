import { router } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Platform, View } from 'react-native';

import { IconButton } from '@/components/ui/icon-button';
import { useAskToLeave } from '@/features/lobby/leave-context';
import { useMySeat, useRoomPresence, useRoomSeats } from '@/features/room';
import { doneNames, pillsFor } from '@/features/swipe/pills';

import { PlayerStack } from './player-stack';
import { Shortlist } from './shortlist';

// The top bar (swipe.md#the-top-bar): Leave, the player stack (one button that opens the players
// sheet, and from a row there the seat sheet), then the room's shortlist. Never anything about
// answers.
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
      <PlayerStack pills={pills} onPress={() => router.push(`/room/${roomId}/players`)} />
      <Shortlist roomId={roomId} />
    </View>
  );
}
