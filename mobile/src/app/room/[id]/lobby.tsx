import { useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, BackHandler, View } from 'react-native';

import { api } from '@/api';
import { LobbyFooter } from '@/components/screens/lobby/lobby-footer';
import { SeatRow } from '@/components/screens/lobby/seat-row';
import { ShufflingOverlay } from '@/components/screens/lobby/shuffling-overlay';
import { RoomBanner } from '@/components/screens/room/room-banner';
import { RoomTicket } from '@/components/shared/room-ticket';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ListRow } from '@/components/ui/list-row';
import { Screen } from '@/components/ui/screen';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { showToast } from '@/components/ui/toast';
import { TopBar } from '@/components/ui/top-bar';
import type { AvatarColor } from '@/components/ui/avatar';
import { useCountryProviders } from '@/features/host/queries';
import { useInvite } from '@/features/invite/invite-link';
import { useSeatAnnouncements } from '@/features/lobby/announce';
import { runLeave } from '@/features/lobby/leave';
import { formatList, serviceNames } from '@/features/lobby/names';
import { useGameModes } from '@/features/lobby/queries';
import { hostSeat, nextHost, presentSeats, seatedSeats, startGate } from '@/features/lobby/seats';
import { runStart, useDealingTimers } from '@/features/lobby/start';
import { useOnline } from '@/features/network';
import {
  ROOM_KEY,
  useMySeat,
  useRoom,
  useRoomConnection,
  useRoomPresence,
  useRoomSeats,
} from '@/features/room';
import { haptics } from '@/lib/haptics';

/** The lobby (docs/design/screens/lobby.md): who is here, live, and the host starts when ready. */
export default function RoomLobbyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation('lobby');
  const { t: tc } = useTranslation();
  const client = useQueryClient();
  const online = useOnline();
  const room = useRoom(id).data;
  const seatsRead = useRoomSeats(id);
  const me = useMySeat(id);
  const { online: here, away } = useRoomPresence(id);
  const { banner, fresh } = useRoomConnection(id);
  const providers = useCountryProviders(room?.country).data;
  const modes = useGameModes().data;
  const invite = useInvite(id);

  const seated = useMemo(() => seatedSeats(seatsRead.data), [seatsRead.data]);
  const host = hostSeat(seated);
  const isHost = me?.role === 'host';
  const present = presentSeats(seated, away);
  const language = i18n.language;
  const list = (names: string[]) => formatList(names, language);
  const namesOf = (ids: readonly number[]) => list(serviceNames(ids, providers));

  useSeatAnnouncements(seatsRead.data ? seated : undefined, {
    joined: (name) => t('a11y.joined', { name }),
    left: (name) => t('a11y.left', { name }),
  });

  // The crown moved to this phone while the lobby is open.
  const wasHost = useRef<boolean | null>(null);
  useEffect(() => {
    if (!me) return;
    const now = me.role === 'host';
    if (wasHost.current === false && now) {
      showToast({ tone: 'info', title: t('youreHost.title'), message: t('youreHost.message') });
    }
    wasHost.current = now;
  }, [me, t]);

  // Start.
  const [starting, setStarting] = useState(false);
  const [needFromServer, setNeedFromServer] = useState<number | null>(null);
  const busy = useRef(false);
  const dealing = room?.state === 'dealing';

  const reread = useCallback(
    () => client.invalidateQueries({ queryKey: ROOM_KEY(id ?? ''), exact: true }),
    [client, id],
  );
  const callStart = useCallback(async () => {
    const outcome = await runStart(() => api.startGame({ room_id: id ?? '' }));
    if (outcome.kind === 'reread') await reread();
    return outcome;
  }, [id, reread]);

  const start = async () => {
    if (busy.current) return;
    busy.current = true;
    setStarting(true);
    setNeedFromServer(null);
    const outcome = await callStart();
    busy.current = false;
    setStarting(false);
    if (outcome.kind === 'need_players') {
      setNeedFromServer(outcome.need);
      haptics.error();
    } else if (outcome.kind === 'failed') {
      showToast({ tone: 'warn', title: t('errors.start') });
    }
  };

  const { slow } = useDealingTimers(dealing, isHost, () => void callStart());

  // Leave.
  const leave = async () => {
    const outcome = await runLeave(id ?? '', online);
    if (outcome === 'offline') showToast({ tone: 'warn', title: tc('states.offlineRoom') });
    else if (outcome === 'failed') showToast({ tone: 'warn', title: tc('errors.generic.title') });
    else {
      router.dismissAll();
      router.replace('/home');
    }
  };
  const askToLeave = () => {
    let body: string | undefined;
    if (!isHost) body = t('leave.bodyGuest');
    else {
      const next = host ? nextHost(seated, host.member_id, away) : null;
      if (next) body = t('leave.bodyHost', { name: next.display_name });
    }
    Alert.alert(t('leave.title'), body, [
      { text: t('leave.stay'), style: 'cancel' },
      { text: t('leave.confirm'), style: 'destructive', onPress: () => void leave() },
    ]);
  };
  const askRef = useRef(askToLeave);
  useEffect(() => {
    askRef.current = askToLeave;
  });
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        askRef.current();
        return true;
      });
      return () => subscription.remove();
    }, []),
  );

  const header = (
    <>
      <TopBar
        title={t('topBar')}
        onBack={askToLeave}
        action={{
          icon: 'share',
          accessibilityLabel: t('a11y.invite'),
          onPress: () => router.push(`/room/${id}/invite`),
        }}
      />
      <RoomBanner roomId={id ?? ''} />
    </>
  );

  if (!room || !seatsRead.data) {
    return (
      <Screen header={header}>
        <View className="gap-6 pt-4">
          <Skeleton className="h-48 w-full rounded-lg" />
          <View className="gap-2">
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-14 w-full rounded-lg" />
            ))}
          </View>
        </View>
      </Screen>
    );
  }

  // The footer.
  const min = modes?.find((mode) => mode.slug === room.mode)?.min_players;
  const awayNames = seated.filter((seat) => away.has(seat.member_id)).map((s) => s.display_name);
  const gate =
    min === undefined
      ? null
      : startGate({ minPlayers: min, present: present.length, awayNames, fresh, online });
  const needCount = gate?.kind === 'need_players' ? gate.need : needFromServer;
  const helper =
    needCount !== null
      ? t('start.needPlayers', { count: needCount })
      : gate?.kind === 'away'
        ? t('start.away', { count: gate.names.length, names: list(gate.names) })
        : null;
  const staleHint = banner
    ? tc(`states.${banner === 'offline' ? 'offlineRoom' : banner}`)
    : undefined;

  const hostName = host?.display_name ?? '';
  const roomNames = serviceNames(room.provider_ids, providers);
  const mineNames = serviceNames(me?.provider_ids ?? [], providers);

  return (
    <View className="flex-1">
      <Screen
        scroll
        header={header}
        footer={
          isHost ? (
            <LobbyFooter
              role="host"
              starting={starting}
              disabled={gate === null || gate.kind === 'need_players' || gate.kind === 'stale'}
              helper={helper}
              hint={staleHint}
              onStart={() => void start()}
            />
          ) : (
            <LobbyFooter role="guest" hostName={hostName} />
          )
        }
      >
        <View className="gap-4 pt-4 pb-4">
          <View
            accessible
            accessibilityLabel={t('a11y.ticket', {
              code: room.code.split('').join(' '),
              count: present.length,
              max: room.max_players,
              host: hostName,
            })}
          >
            <RoomTicket
              code={room.code}
              leftDetail={t('ticket.players', { count: present.length, max: room.max_players })}
              rightDetail={t('ticket.host', { name: hostName })}
            />
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Button
                label={t('shareLink')}
                icon="link"
                variant="secondary"
                size="s"
                block
                disabled={invite.state !== 'ready'}
                onPress={() => void invite.share()}
              />
            </View>
            <View className="flex-1">
              <Button
                label={t('showQr')}
                icon="qr"
                variant="secondary"
                size="s"
                block
                onPress={() => router.push(`/room/${id}/invite`)}
              />
            </View>
          </View>

          {room.mode === 'quick_match' ? (
            <Text variant="body-s" tone="secondary">
              {t('rules.quickMatch')}
            </Text>
          ) : null}

          <View className="gap-2">
            <Text variant="mono-eyebrow" tone="secondary" accessibilityRole="header">
              {t('inTheRoom')}
            </Text>
            <View className="overflow-hidden rounded-lg border border-border-default bg-bg-surface">
              {seated.map((seat, index) => (
                <SeatRow
                  key={seat.member_id}
                  name={seat.display_name}
                  color={seat.avatar_key as AvatarColor}
                  services={namesOf(seat.provider_ids)}
                  isHost={seat.role === 'host'}
                  isMe={seat.is_me === true}
                  present={seat.is_me === true || here.has(seat.member_id)}
                  away={away.has(seat.member_id)}
                  last={index === seated.length - 1 && seated.length > 1}
                />
              ))}
              {seated.length === 1 ? (
                <View className="min-h-14 flex-row items-center gap-3.5 p-4">
                  <Icon name="users" size={20} color="text-muted" />
                  <Text variant="body-s" tone="muted" className="flex-1">
                    {t('alone')}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {roomNames.length > 0 ? (
            <Text variant="body-s" tone="muted">
              {t('roomServices', { list: list(roomNames) })}
            </Text>
          ) : null}

          {isHost ? null : (
            <View className="overflow-hidden rounded-lg border border-border-default bg-bg-surface">
              <ListRow
                icon="tv"
                label={t('yourServices.label')}
                value={mineNames.length > 0 ? list(mineNames) : t('yourServices.optional')}
                onPress={() => router.push(`/room/${id}/services`)}
              />
            </View>
          )}
        </View>
      </Screen>
      {dealing ? (
        <ShufflingOverlay slow={slow} onRetry={isHost ? () => void start() : undefined} />
      ) : null}
    </View>
  );
}
