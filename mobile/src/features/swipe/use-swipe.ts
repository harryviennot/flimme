import type { NextCard, RoomSeat } from '@flimme/contract';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import { api } from '@/api';
import { setHeldCardSource } from '@/features/match/use-match-card';
import { useAppConfig } from '@/features/app-config/use-app-config';
import { useOnline } from '@/features/network';
import { ROOM_KEY, useKeptRoom, useRoomEvent } from '@/features/room';
import { useRoomRealtime } from '@/features/room/realtime';
import i18n from '@/i18n';

import { createAnswerer, type AnswerKind } from './answer';
import { createCardStack, type AnsweredCard } from './card-stack';
import { voteQueue } from './index';

// Everything the swipe screen needs from the app, in one hook: the card stack for this seat,
// the answer path into the vote queue, and what the room's events and the connection do to
// them. The screen under it only draws (components/screens/swipe/).

/** A state-changing event or answer that ends the swiping: the screen takes no more input. */
function movesOn(payload: unknown): boolean {
  const state = (payload as { state?: unknown } | null)?.state;
  return typeof state === 'string' && state !== 'swiping';
}

export function useSwipe(roomId: string, seat: RoomSeat, screenWidth: number) {
  const online = useOnline();
  const queryClient = useQueryClient();
  const realtime = useRoomRealtime();
  const kept = useKeptRoom().room?.id;
  const config = useAppConfig().data;
  // What callbacks made once need to read fresh: the channels and whether the room moved on.
  const [live] = useState(() => createStore(() => ({ realtime, locked: false })));
  useEffect(() => {
    live.setState({ realtime });
  }, [live, realtime]);
  const locked = useStore(live, (s) => s.locked);
  const [superLikesLeft, setSuperLikesLeft] = useState(seat.super_likes_left);

  // The answers given on this phone, so a refill that was already in flight never deals them back.
  const [answered] = useState(() => new Set<number>());
  // The cards answered on this phone, so the match overlay finds the film it just threw.
  const [thrown] = useState(() => new Map<number, NextCard>());
  const [stack] = useState(() =>
    createCardStack(
      {
        fetchCards: (limit) =>
          api.myNextCards({
            room_id: roomId,
            limit,
            member_id: seat.member_id,
            language: i18n.language,
          }),
        requestCards: () => api.requestCards({ room_id: roomId, member_id: seat.member_id }),
        prefetch: (urls) => void Image.prefetch(urls, 'memory-disk'),
        isAnswered: (titleId) => answered.has(titleId) || voteQueue.has(roomId, titleId),
        now: () => Date.now(),
      },
      { imageBase: config?.tmdb_image_base, screenWidth },
    ),
  );

  const [answerer] = useState(() =>
    createAnswerer({
      stack,
      queue: voteQueue,
      roomId,
      memberId: seat.member_id,
      initialSuperLikes: seat.super_likes_left,
      // What the server counted plus what is still waiting on this phone.
      initialCount: seat.swipe_count + voteQueue.pending(roomId),
      locked: () => live.getState().locked,
      now: () => Date.now(),
      onCount: (count) => {
        live.getState().realtime?.setPresence({ swipe_count: count, done: false });
      },
    }),
  );

  // The room moved on (a match, the finale): no more input, and the room is read again so the
  // layout follows its state even if the event that said so never arrived.
  const lock = useCallback(() => {
    live.setState({ locked: true });
    void queryClient.invalidateQueries({ queryKey: ROOM_KEY(roomId), exact: true });
  }, [live, queryClient, roomId]);

  const answer = useCallback(
    (kind: AnswerKind): AnsweredCard | null => {
      const done = answerer.answer(kind);
      if (done) {
        answered.add(done.card.title_id);
        thrown.set(done.card.title_id, done.card);
        setSuperLikesLeft(answerer.superLikesLeft());
      }
      return done;
    },
    [answerer, answered, thrown],
  );

  // The match overlay asks this screen for the film's card first: one the phone already holds
  // (thrown, mounted or behind) needs no read.
  useEffect(() => {
    setHeldCardSource((titleId) => {
      const { mounted, buffer } = stack.getState();
      return thrown.get(titleId) ?? [...mounted, ...buffer].find((c) => c.title_id === titleId);
    });
    return () => setHeldCardSource(null);
  }, [stack, thrown]);

  // The deck: fetch on open, stop on leave.
  useEffect(() => {
    stack.getState().start();
    return () => stack.getState().stop();
  }, [stack]);

  // Cards are handed out by the server: fetch again when it says the deck moved.
  useRoomEvent(roomId, 'deck_updated', (payload) => {
    const ids = (payload as { member_ids?: unknown } | null)?.member_ids;
    if (Array.isArray(ids) && ids.includes(seat.member_id)) stack.getState().onDeckUpdated();
  });
  // A match that is not decided (the Final Cut's shortlist) keeps the room swiping.
  useRoomEvent(roomId, 'match', (payload) => {
    if ((payload as { decided?: unknown } | null)?.decided !== false) lock();
  });
  useRoomEvent(roomId, 'finale_started', lock);
  useRoomEvent(roomId, 'state_changed', (payload) => {
    if (movesOn(payload)) lock();
  });

  // What the vote queue learns from the server while it sends.
  useEffect(
    () =>
      voteQueue.onAnswer((event) => {
        if (event.room_id !== roomId) return;
        if (event.type === 'match') {
          if (event.decided !== false) lock();
        } else if (event.type === 'finale' || event.type === 'closed') lock();
        else if (event.type === 'no_super_likes') {
          answerer.giveBackSuperLike();
          setSuperLikesLeft(answerer.superLikesLeft());
        } else if (event.type === 'card_not_dealt') stack.getState().onDeckUpdated();
      }),
    [roomId, answerer, stack, lock],
  );

  // Connection: the stack waits offline and refills on return; the queue sends what waited.
  const wasOffline = useRef(false);
  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      stack.getState().onOffline();
    } else if (wasOffline.current) {
      wasOffline.current = false;
      stack.getState().onOnline();
    }
  }, [online, stack]);

  // The queue flushes once the room is the kept one (it drops votes of any other room), when
  // the phone comes back online and when the app returns to the foreground.
  useEffect(() => {
    if (kept === roomId && online) void voteQueue.flush();
  }, [kept, roomId, online]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !online) return;
      if (voteQueue.store.getState().votes.length > 0) void voteQueue.flush();
      stack.getState().onOnline();
    });
    return () => subscription.remove();
  }, [stack, online]);

  // No cards left after the server was asked: say so in presence.
  const status = useStore(stack, (s) => s.status);
  useEffect(() => {
    if (status === 'empty') {
      live.getState().realtime?.setPresence({ swipe_count: answerer.count(), done: true });
    }
  }, [status, answerer, live]);

  const waitingVotes = useStore(
    voteQueue.store,
    (s) => s.votes.filter((vote) => vote.room_id === roomId).length,
  );

  return {
    stack,
    answer,
    superLikesLeft,
    waitingVotes,
    locked,
    online,
    imageBase: config?.tmdb_image_base,
  };
}

export type Swipe = ReturnType<typeof useSwipe>;
