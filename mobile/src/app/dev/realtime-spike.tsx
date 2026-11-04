import { ROOM_EVENTS, roomLiveTopic, roomTopic } from '@flimme/contract';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, View } from 'react-native';

import { api } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TopBar } from '@/components/ui/top-bar';
import { startSessionWith } from '@/features/session/start-session';
import { supabase } from '@/lib/supabase';

// Diagnostic for spike 4 of app-structure.md#spikes-to-run-first: does a private room channel
// survive a token refresh, a silent network and the app going to the background? Development
// builds only, linked from /dev. It opens `room:<id>` and `room:<id>:live` the way the room
// layout will, and writes everything it sees (statuses, events, presence, token refreshes) to
// the screen, newest first, and to the Metro console. The findings are in the doc. Dev screens
// are English only.
const MAX_LINES = 60;
const RETRACK_ON_REJOIN = true;

const clock = () => new Date().toISOString().slice(11, 23);

export default function RealtimeSpikeScreen() {
  const [lines, setLines] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [room, setRoom] = useState<{ id: string; code: string; member: string } | null>(null);
  const [statuses, setStatuses] = useState({ room: '-', live: '-' });
  const channels = useRef<RealtimeChannel[]>([]);
  const poke = useRef(0);

  const log = useCallback((message: string) => {
    const line = `${clock()} ${message}`;
    console.log(`[realtime-spike] ${line}`);
    setLines((all) => [line, ...all].slice(0, MAX_LINES));
  }, []);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const left = session ? Math.round((session.expires_at ?? 0) - Date.now() / 1000) : 0;
      log(`AUTH ${event} (token expires in ${left}s)`);
    });
    const app = AppState.addEventListener('change', (state) => log(`APP ${state}`));
    return () => {
      data.subscription.unsubscribe();
      app.remove();

      channels.current.forEach((channel) => void supabase.removeChannel(channel));
    };
  }, [log]);

  const open = useCallback(
    (roomId: string, memberId: string) => {
      channels.current.forEach((channel) => void supabase.removeChannel(channel));
      const config = { private: true };

      const events = supabase.channel(roomTopic(roomId), { config });
      events.on('broadcast', { event: '*' }, (message) => {
        const known = (ROOM_EVENTS as readonly string[]).includes(message.event)
          ? ''
          : ' (unknown)';
        log(`EVENT ${message.event}${known} ${JSON.stringify(message.payload)}`);
      });
      events.subscribe((status, error) => {
        log(`room ${status}${error ? ` ${error.message}` : ''}`);
        setStatuses((s) => ({ ...s, room: status }));
      });

      const live = supabase.channel(roomLiveTopic(roomId), {
        config: { ...config, presence: { key: memberId } },
      });
      live.on('broadcast', { event: 'reaction' }, (message) =>
        log(`LIVE reaction ${JSON.stringify(message.payload)}`),
      );
      live.on('presence', { event: 'sync' }, () => {
        log(`PRESENCE sync: ${Object.keys(live.presenceState()).length} here`);
      });
      live.on('presence', { event: 'join' }, ({ key }) => log(`PRESENCE join ${key.slice(0, 8)}`));
      live.on('presence', { event: 'leave' }, ({ key }) =>
        log(`PRESENCE leave ${key.slice(0, 8)}`),
      );
      let tracked = false;
      live.subscribe(async (status, error) => {
        log(`live ${status}${error ? ` ${error.message}` : ''}`);
        setStatuses((s) => ({ ...s, live: status }));
        // Presence does not come back by itself after a rejoin (see the findings), so the room
        // layout must track again on every SUBSCRIBED. To see that for yourself, set
        // RETRACK_ON_REJOIN to false: only the first SUBSCRIBED then tracks.
        if (status === 'SUBSCRIBED' && (RETRACK_ON_REJOIN || !tracked)) {
          tracked = true;
          log(`live track -> ${await live.track({ seats: 1 })}`);
        }
      });

      channels.current = [events, live];
    },
    [log],
  );

  const enter = async (host: boolean) => {
    try {
      const session = await startSessionWith(supabase);
      log(`session ${session.status}`);
      if (session.status !== 'ok') return;
      const profile = await api.updateProfile({
        display_name: host ? 'Spike host' : 'Spike guest',
        country: 'FR',
        language: 'fr',
      });
      log(`update_profile ${profile.status}`);
      if (host) {
        const created = await api.createRoom({ country: 'FR' });
        log(`create_room ${created.status}`);
        if (created.status !== 'ok') return;
        const member = await api.joinRoom({ code: created.code });
        log(`join_room ${member.status}`);
        if (member.status !== 'ok') return;
        setRoom({ id: created.room_id, code: created.code, member: member.member_id });
        open(created.room_id, member.member_id);
      } else {
        const joined = await api.joinRoom({ code });
        log(`join_room ${joined.status}`);
        if (joined.status !== 'ok') return;
        setRoom({ id: joined.room_id, code, member: joined.member_id });
        open(joined.room_id, joined.member_id);
      }
    } catch (error) {
      log(`ERROR ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // The host changes a setting: the server broadcasts `settings_changed` to the room.
  const pokeSettings = async () => {
    if (!room) return;
    poke.current += 1;
    const answer = await api.updateRoomSettings({
      room_id: room.id,
      settings: { runtime_max: poke.current % 2 ? 120 : 90 },
    });
    log(`update_room_settings #${poke.current} ${answer.status}`);
  };

  const react = async () => {
    const live = channels.current[1];
    if (!live) return;
    const sent = await live.send({ type: 'broadcast', event: 'reaction', payload: { emoji: 'x' } });
    log(`send reaction -> ${sent}`);
  };

  // A session stored in the keychain can outlive a reinstall and belong to another backend.
  const signOut = async () => {
    channels.current.forEach((channel) => void supabase.removeChannel(channel));
    channels.current = [];
    setRoom(null);
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    log(`signOut ${error ? error.message : 'ok'}`);
  };

  const refresh = async () => {
    const { error } = await supabase.auth.refreshSession();
    log(`refreshSession ${error ? error.message : 'ok'}`);
  };

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <Screen padded={false} header={<TopBar title="Realtime spike" onBack={() => router.back()} />}>
      <ScrollView contentContainerClassName="gap-4 px-5 pb-10" testID="realtime-spike">
        <Text variant="mono-data" tone="primary" testID="spike-status">
          {`room ${room?.code ?? '-'} | events ${statuses.room} | live ${statuses.live}`}
        </Text>
        <View className="flex-row gap-3">
          <Button label="Host" size="s" onPress={() => void enter(true)} />
          <Button label="Join" size="s" variant="secondary" onPress={() => void enter(false)} />
          <Button label="Poke" size="s" variant="secondary" onPress={() => void pokeSettings()} />
        </View>
        <View className="flex-row gap-3">
          <Button label="React" size="s" variant="secondary" onPress={() => void react()} />
          <Button label="Refresh" size="s" variant="secondary" onPress={() => void refresh()} />
          <Button label="Out" size="s" variant="secondary" onPress={() => void signOut()} />
        </View>
        <Input
          label="Code to join"
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <Text variant="mono-data" tone="secondary" testID="spike-log">
          {lines.join('\n')}
        </Text>
      </ScrollView>
    </Screen>
  );
}
