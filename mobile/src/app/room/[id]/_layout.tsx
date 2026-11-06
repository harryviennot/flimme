import { router, Stack, useLocalSearchParams, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { RoomLeaveGuard } from '@/components/screens/room/leave-guard';
import { MatchOverlayHost } from '@/components/screens/room/match-overlay-host';
import { ErrorScreen } from '@/components/shared/error-screen';
import {
  isAllowed,
  isSheet,
  mySeatOf,
  roomScreenFor,
  useExitRoomToHome,
  useHeartbeat,
  useKeptRoom,
  RoomRealtimeProvider,
  useRefreshOnForeground,
  useRemovedExit,
  useRemovedListener,
  useRoom,
  useRoomChannels,
  useRoomSounds,
  useRoomSeats,
} from '@/features/room';
import { useCountGame, useRoomCap } from '@/features/analytics';
import { useFinalePreload } from '@/features/finale/use-finale-preload';
import { useRevealOf } from '@/features/finale/reveal-store';
import { useRevealHold } from '@/features/finale/use-reveal-hold';
import { useMatchOverlay } from '@/features/match/use-match-overlay';
import { ShortlistProvider, useShortlist, useShortlistHold } from '@/features/shortlist';
import { useOnline } from '@/features/network';
import { useIsSolo, useSoloDealFallback, useSoloEnd } from '@/features/solo/use-solo-room';
import { rememberRoomScreen } from '@/features/winner/arrival';
import { tokens } from '@/theme/generated/tokens';

// Every room screen sits under this layout. It reads the room and the phone's seat, shows the
// screen the room's state calls for (the phone never moves on by itself), keeps the seat present
// while the app is open and remembers the room on the phone. M4.21 adds the Realtime topics.
export default function RoomLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const segments = useSegments() as string[];
  const current = segments[2];
  const online = useOnline();
  const room = useRoom(id);
  const seats = useRoomSeats(id);
  // No analytics event leaves the phone in a room capped under 13 (analytics.md#kids).
  useRoomCap(room.data);
  const { keep, forget } = useKeptRoom();
  const exitToHome = useExitRoomToHome();
  const exitRemoved = useRemovedExit(id);

  const settled = !room.isFetching && !seats.isFetching;
  const mine = mySeatOf(seats.data);
  // Only a fresh answer counts: a cached one may be from before the player (re)joined.
  const notSeated =
    online &&
    settled &&
    room.isSuccess &&
    (room.data === null || (seats.isSuccess && mine === null));
  const state = notSeated ? undefined : room.data?.state;
  const code = room.data?.code;
  // A solo room (swipe.md#solo): never kept for the launch rejoin, no lobby, and an end with no
  // pick sends the phone to Play with a note.
  const solo = useIsSolo(id);
  const mode = room.data?.mode;
  // A solo session is not a game played: the group count leaves it out (M6.46 has its own events).
  useCountGame(id, solo ? undefined : state);
  const soloHold = useSoloEnd(id ?? '', state, solo);
  useSoloDealFallback(id ?? '', state, solo);

  useHeartbeat(id, room.data !== null);
  useRefreshOnForeground(id);
  const realtime = useRoomChannels(id);
  // The room's sounds: made now, freed when the room ends; the start and arrival notes.
  useRoomSounds(id, state, seats.data, mine?.member_id, realtime);
  // `member_removed` naming this seat: the usual way a removed phone learns, while it hears.
  useRemovedListener(realtime, mine?.member_id, () => exitRemoved(false));

  useEffect(() => {
    if (!id) return;
    if (notSeated) {
      // A null room read is a removed seat (a seat that left still reads the room): say why.
      // Otherwise the seat left by itself and Home says nothing.
      if (room.data === null) exitRemoved(true);
      else {
        forget(id);
        exitToHome();
      }
      return;
    }
    if (!state || !code || !mine) return;
    if (state === 'done' || state === 'abandoned' || solo) forget(id);
    else keep({ id, code });
  }, [id, notSeated, state, code, mine, solo, keep, forget, exitToHome, exitRemoved, room.data]);

  // The match overlay plays over the swipe screen: the room is already `done`, and the layout
  // holds its route change until the overlay hands over (match.md#the-sequence).
  const match = useMatchOverlay(id, state, mine !== null, realtime);

  // The shortlisted beat plays over the swipe screen; on the third match the room is already in
  // `finale`, and the layout holds its route until the beat ends (swipe.md#the-shortlisted-beat).
  const shortlist = useShortlist(id, state, room.data?.mode, mine !== null, realtime);
  const shortlistHold = useShortlistHold(shortlist);

  // The winner screen fades in only when it replaces the swipe or Final Cut screen live.
  useEffect(() => {
    if (id && current) rememberRoomScreen(id, current);
  }, [id, current]);

  // The reveal may keep the Final Cut screen up after the round closes (final-cut.md#the-reveal).
  // The finalists' posters load on `finale_started`.
  const revealHold = useRevealHold(id, state, current, realtime);
  const revealPlaying = useRevealOf(id).phase === 'playing';
  useFinalePreload(id, realtime);

  useEffect(() => {
    if (match.holdRoute || shortlistHold || soloHold) return;
    if (revealHold) {
      // A phone still on the swipe screen when the round closed shows the reveal on the Final Cut,
      // once there is a reveal to show: while it is still being looked for, the route stays put.
      if (id && revealPlaying && state === 'done' && current && current !== 'final-cut') {
        if (isSheet(current)) router.dismiss();
        router.replace(`/room/${id}/final-cut`);
      }
      return;
    }
    if (!id || !state || !current || isAllowed(state, current, mode)) return;
    // A sheet goes first, so the state's screen replaces the room screen under it.
    if (isSheet(current)) router.dismiss();
    router.replace(`/room/${id}/${roomScreenFor(state, mode)}`);
  }, [
    id,
    state,
    mode,
    current,
    match.holdRoute,
    shortlistHold,
    soloHold,
    revealHold,
    revealPlaying,
  ]);

  if (online && (room.isError || seats.isError) && !room.data) {
    return (
      <ErrorScreen
        error={(room.error ?? seats.error) as Error}
        retry={async () => {
          await Promise.all([room.refetch(), seats.refetch()]);
        }}
      />
    );
  }

  return (
    <RoomRealtimeProvider value={realtime}>
      <ShortlistProvider value={shortlist}>
        <RoomLeaveGuard
          roomId={id ?? ''}
          active={!current || !isSheet(current)}
          finished={state === 'done' || state === 'abandoned'}
          solo={solo}
        >
          <View className="flex-1">
            <Stack
              screenOptions={{
                headerShown: false,
                // Once swiping starts, leaving is an explicit "Leave room", never a back swipe.
                gestureEnabled: false,
                contentStyle: { backgroundColor: tokens.color['bg-canvas'] },
              }}
            >
              <Stack.Screen
                name="invite"
                options={{
                  presentation: 'formSheet',
                  // The stack turns gestures off for the room; a sheet still swipes down.
                  gestureEnabled: true,
                  sheetGrabberVisible: true,
                  sheetAllowedDetents: [0.8],
                }}
              />
              <Stack.Screen
                name="services"
                options={{
                  presentation: 'formSheet',
                  // The stack turns gestures off for the room; a sheet still swipes down.
                  gestureEnabled: true,
                  sheetGrabberVisible: true,
                  sheetAllowedDetents: [0.8],
                }}
              />
              <Stack.Screen
                name="genres"
                options={{
                  presentation: 'formSheet',
                  // The stack turns gestures off for the room; a sheet still swipes down.
                  gestureEnabled: true,
                  sheetGrabberVisible: true,
                  sheetAllowedDetents: [0.8],
                }}
              />
              <Stack.Screen
                name="seat/[memberId]"
                options={{
                  presentation: 'formSheet',
                  // The stack turns gestures off for the room; a sheet still swipes down.
                  gestureEnabled: true,
                  sheetGrabberVisible: true,
                  sheetAllowedDetents: 'fitToContents',
                }}
              />
              <Stack.Screen
                name="report/[memberId]"
                options={{
                  presentation: 'formSheet',
                  // The stack turns gestures off for the room; a sheet still swipes down.
                  gestureEnabled: true,
                  sheetGrabberVisible: true,
                  sheetAllowedDetents: 'fitToContents',
                }}
              />
              <Stack.Screen
                name="pick"
                options={{
                  presentation: 'formSheet',
                  // The stack turns gestures off for the room; a sheet still swipes down.
                  gestureEnabled: true,
                  sheetGrabberVisible: true,
                  sheetAllowedDetents: [0.8],
                }}
              />
              <Stack.Screen
                name="recap"
                options={{
                  presentation: 'formSheet',
                  // The stack turns gestures off for the room; a sheet still swipes down.
                  gestureEnabled: true,
                  sheetGrabberVisible: true,
                  sheetAllowedDetents: [0.9],
                }}
              />
              <Stack.Screen
                name="film/[title]"
                options={{
                  presentation: 'formSheet',
                  // The stack turns gestures off for the room; a sheet still swipes down.
                  gestureEnabled: true,
                  sheetGrabberVisible: true,
                  sheetAllowedDetents: [0.9],
                }}
              />
            </Stack>
            <MatchOverlayHost
              roomId={id ?? ''}
              match={match.match}
              seats={seats.data}
              onContinue={match.skip}
            />
          </View>
        </RoomLeaveGuard>
      </ShortlistProvider>
    </RoomRealtimeProvider>
  );
}
