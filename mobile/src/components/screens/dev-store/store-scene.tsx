import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { fixturePosters } from '@/components/gallery';
import { FinalCutScreen } from '@/components/screens/final-cut/final-cut-screen';
import { LobbyFooter } from '@/components/screens/lobby/lobby-footer';
import { SeatRow } from '@/components/shared/seat-row';
import { RecapCard } from '@/components/screens/recap/recap-card';
import { MatchOverlay } from '@/components/screens/room/match-overlay';
import { ActionRow } from '@/components/screens/swipe/action-row';
import { MovieCard } from '@/components/shared/movie-card';
import { PlayerPill } from '@/components/shared/player-pill';
import { RoomTicket } from '@/components/shared/room-ticket';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TopBar } from '@/components/ui/top-bar';
import { EMPTY_BALLOT, placesOf, pressFinalist, tapFinalist } from '@/features/finale/ballot';
import type { FinalCutModel } from '@/features/finale/use-final-cut';
import { LeaveContext } from '@/features/lobby/leave-context';
import {
  metaOf,
  STORE_FILMS,
  STORE_PLAYERS,
  STORE_RECAP,
  STORE_ROOM_CODE,
  STORE_SERVICES,
  STORE_SITE,
  type StoreFilm,
  type StoreLanguage,
  type StoreScene,
} from '@/features/dev/store-fixtures';
import { formatRecapTime } from '@/features/recap/time';
import { tokens } from '@/theme/generated/tokens';

// The store screenshots' scenes (docs/store/screenshots.md): the real components over fixture
// data, with no room and no network. Dev builds only: the route gates on __DEV__.

const FILM: StoreFilm = STORE_FILMS[0] as StoreFilm;
const noop = () => undefined;

function Swipe({ language }: { language: StoreLanguage }) {
  const { t: tl } = useTranslation('lobby');
  const lit = useSharedValue(0);
  return (
    <Screen
      padded={false}
      footer={
        <ActionRow
          canAnswer
          superLikesLeft={1}
          canUndo={false}
          onUndo={noop}
          onAnswer={noop}
          lit={lit}
        />
      }
    >
      <View className="flex-row items-center gap-2 px-5 pt-2 pb-2">
        <IconButton icon="x" accessibilityLabel={tl('a11y.leave')} onPress={noop} />
        <View className="flex-1 flex-row items-center gap-2">
          {STORE_PLAYERS.slice(0, 3).map((player, i) => (
            <PlayerPill
              key={player.id}
              name={player.name}
              color={player.color}
              count={player.count}
              online
              isMe={i === 0}
              isHost={i === 1}
            />
          ))}
        </View>
      </View>
      <View className="flex-1 justify-center px-5">
        <View
          style={{
            transform: [{ translateX: 16 }, { rotate: `${tokens.rotation['poster-fan'] / 2}deg` }],
          }}
        >
          <MovieCard
            title={FILM.title}
            meta={metaOf(FILM, language)}
            poster={fixturePosters[FILM.poster]}
            services={[...STORE_SERVICES]}
            stamp="like"
            back={{ meta: String(FILM.year), synopsis: FILM.synopsis[language] }}
          />
        </View>
      </View>
    </Screen>
  );
}

function Match({ language }: { language: StoreLanguage }) {
  return (
    <MatchOverlay
      film={{ title: FILM.title, meta: metaOf(FILM, language) }}
      poster={fixturePosters[FILM.poster]}
      count={{ likes: 4, of: 4 }}
      players={STORE_PLAYERS}
      language={language}
      onContinue={noop}
    />
  );
}

function Lobby() {
  const { t } = useTranslation('lobby');
  return (
    <Screen
      scroll
      header={
        <TopBar
          title={t('topBar')}
          onBack={noop}
          action={{ icon: 'share', accessibilityLabel: t('a11y.invite'), onPress: noop }}
        />
      }
      footer={
        <LobbyFooter role="host" starting={false} disabled={false} helper={null} onStart={noop} />
      }
    >
      <View className="gap-4 pt-4 pb-4">
        <RoomTicket
          code={STORE_ROOM_CODE}
          leftDetail={t('ticket.players', { count: STORE_PLAYERS.length, max: 10 })}
          rightDetail={t('ticket.host', { name: STORE_PLAYERS[0]?.name })}
        />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Button
              label={t('shareLink')}
              icon="link"
              variant="secondary"
              size="s"
              block
              onPress={noop}
            />
          </View>
          <View className="flex-1">
            <Button
              label={t('showQr')}
              icon="qr"
              variant="secondary"
              size="s"
              block
              onPress={noop}
            />
          </View>
        </View>
        <Text variant="body-s" tone="secondary">
          {t('rules.quickMatch')}
        </Text>
        <View className="gap-2">
          <Text variant="mono-eyebrow" tone="secondary">
            {t('inTheRoom')}
          </Text>
          <View className="overflow-hidden rounded-lg border border-border-default bg-bg-surface">
            {STORE_PLAYERS.map((player, index) => (
              <SeatRow
                key={player.id}
                name={player.name}
                color={player.color}
                detail="Service A, Service B"
                isHost={index === 0}
                isMe={index === 0}
                present
                away={false}
                last={index === STORE_PLAYERS.length - 1}
              />
            ))}
          </View>
        </View>
      </View>
    </Screen>
  );
}

function CardBack({ language }: { language: StoreLanguage }) {
  return (
    <Screen>
      <View className="flex-1 justify-center">
        <MovieCard
          title={FILM.title}
          meta={metaOf(FILM, language)}
          poster={fixturePosters[FILM.poster]}
          services={[...STORE_SERVICES]}
          flipped
          still
          back={{
            meta: `${FILM.year} · ${FILM.runtime.h} h ${FILM.runtime.min}`,
            tmdbRating: FILM.rating,
            synopsis: FILM.synopsis[language],
            director: FILM.director,
            cast: FILM.cast,
            services: STORE_SERVICES.map((name) => ({ name })),
          }}
        />
      </View>
    </Screen>
  );
}

const KEYS = ['blue', 'green', 'gold', 'red'] as const;

function FinalCut() {
  const [deadline] = useState(() => new Date(Date.now() + 47_000).toISOString());
  const films = STORE_FILMS.slice(0, 3).map((film) => ({
    titleId: film.id,
    title: film.title,
    year: film.year,
    poster: fixturePosters[film.poster],
    placeholder: null,
    noPoster: false,
    hasSynopsis: false,
  }));
  const ballot = pressFinalist(tapFinalist(EMPTY_BALLOT, 1), 3, true);
  const model: FinalCutModel = {
    kind: 'final_cut',
    pickOne: false,
    phase: 'voting',
    loadFailed: false,
    postersFailed: false,
    slots: films.length,
    finalists: films,
    places: placesOf(
      films.map((film) => film.titleId),
      ballot,
    ),
    vetoAllowed: true,
    deadline,
    countdownOn: true,
    tick: false,
    seats: STORE_PLAYERS.map((player, i) => ({
      memberId: player.id,
      name: player.name,
      avatarKey: KEYS[i] ?? 'blue',
      locked: i === 1 || i === 2,
    })),
    count: 2,
    of: STORE_PLAYERS.length,
    status: null,
    meLocked: false,
    numbersHidden: false,
    online: true,
    onTap: noop,
    onLongPress: noop,
    onInfo: noop,
    onLockIn: noop,
    onEnd: noop,
    retryLoad: noop,
    retryPosters: noop,
  };
  return (
    <LeaveContext.Provider value={noop}>
      <FinalCutScreen roomId="store" model={model} />
    </LeaveContext.Provider>
  );
}

function Recap({ language }: { language: StoreLanguage }) {
  const { t } = useTranslation('recap');
  const uri = Image.resolveAssetSource(fixturePosters[FILM.poster])?.uri ?? null;
  return (
    <Screen>
      <View className="flex-1 items-center justify-center">
        <RecapCard
          title={FILM.title}
          posterUri={uri}
          time={formatRecapTime(STORE_RECAP.seconds, t, language)}
          people={STORE_RECAP.people}
          swipes={STORE_RECAP.swipes}
          site={STORE_SITE}
          language={language}
        />
      </View>
    </Screen>
  );
}

export function StoreSceneView({
  scene,
  language,
}: {
  scene: StoreScene;
  language: StoreLanguage;
}) {
  switch (scene) {
    case 'swipe':
      return <Swipe language={language} />;
    case 'match':
      return <Match language={language} />;
    case 'lobby':
      return <Lobby />;
    case 'card-back':
      return <CardBack language={language} />;
    case 'final-cut':
      return <FinalCut />;
    case 'recap':
      return <Recap language={language} />;
  }
}
