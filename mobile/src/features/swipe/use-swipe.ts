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
import { ROOM_KEY, useKeptRoom, useRoom, useRoomEvent } from '@/features/room';
import { useRoomRealtime } from '@/features/room/realtime';
import { useShortlistView } from '@/features/shortlist/context';
import i18n from '@/i18n';
import { duration } from '@/theme/motion';

import { createAnswerer, type AnswerKind } from './answer';
import { createCardStack, type AnsweredCard } from './card-stack';
import type { Direction } from './feel';
import { createUndoer, type LastAnswer } from './undo';
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
  // Whether "Seen it" asks the rewatch question; unknown means it doesn't (the film just leaves).
  const seenRule = useRoom(roomId).data?.seen_rule;
  // What callbacks made once need to read fresh: the channels and whether the room moved on.
  const [live] = useState(() =>
    createStore(() => ({
      realtime,
      locked: false,
      beating: false,
      shortlisted: new Set<number>() as ReadonlySet<number>,
    })),
  );
  // The shortlisted beat (moments.md#the-shortlisted-beat): the stack takes no input while it
  // plays, and a film on the shortlist leaves this phone's stack.
  const shortlist = useShortlistView();
  useEffect(() => {
    live.setState({ realtime, beating: shortlist.active, shortlisted: shortlist.known });
  }, [live, realtime, shortlist.active, shortlist.known]);
  const locked = useStore(live, (s) => s.locked);
  const [superLikesLeft, setSuperLikesLeft] = useState(seat.super_likes_left ?? 0);

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
        isAnswered: (titleId) =>
          answered.has(titleId) ||
          voteQueue.has(roomId, titleId) ||
          live.getState().shortlisted.has(titleId),
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
      initialSuperLikes: seat.super_likes_left ?? 0,
      // What the server counted plus what is still waiting on this phone.
      initialCount: seat.swipe_count + voteQueue.pending(roomId),
      locked: () => live.getState().locked || live.getState().beating,
      now: () => Date.now(),
      onCount: (count) => {
        live.getState().realtime?.setPresence({ swipe_count: count, done: false });
      },
    }),
  );

  // This phone's exact number of answers, for its own pill.
  const [count, setCount] = useState(() => answerer.count());

  const [undoer] = useState(() =>
    createUndoer({
      stack,
      queue: voteQueue,
      roomId,
      memberId: seat.member_id,
      locked: () => live.getState().locked || live.getState().beating,
    }),
  );
  // The card Undo just brought back and the answer it had: the card moves in from that side.
  const [returning, setReturning] = useState<(LastAnswer & { direction?: Direction }) | null>(null);
  // Super likes already given back (by a refusal or by Undo), so the badge never counts one twice.
  const [refunded] = useState(() => new Set<number>());
  // Presence says this seat is done (no cards left); Undo takes that back.
  const doneSent = useRef(false);

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
        undoer.record(done.card, kind);
        if (kind === 'super_like') refunded.delete(done.card.title_id);
        setReturning(null);
        setSuperLikesLeft(answerer.superLikesLeft());
        setCount(answerer.count());
      }
      return done;
    },
    [answerer, answered, thrown, undoer, refunded],
  );

  /** `direction` is the side the card left from (a No to the rewatch question goes left). */
  const undo = useCallback(
    (direction?: Direction): LastAnswer | null => {
      const back = undoer.undo();
      if (!back) return null;
      const titleId = back.card.title_id;
      answered.delete(titleId);
      if (back.kind === 'super_like' && !refunded.has(titleId)) {
        refunded.add(titleId);
        answerer.giveBackSuperLike();
        setSuperLikesLeft(answerer.superLikesLeft());
      }
      answerer.undone();
      setCount(answerer.count());
      // Undoing the answer that emptied the stack: the others stop seeing "Done" for this seat.
      if (doneSent.current) {
        doneSent.current = false;
        live.getState().realtime?.setPresence({ swipe_count: answerer.count(), done: false });
      }
      setReturning({ ...back, direction });
      return back;
    },
    [undoer, answered, answerer, refunded, live],
  );

  // Undo wakes with the first answer and sleeps after use, or when the room moves on.
  // Not after a match: "A card that matched can't be undone" (swipe.md#undo).
  const lastId = useStore(undoer.state, (s) => s.last?.card.title_id);
  const undoShortlisted = lastId !== undefined && shortlist.known.has(lastId);
  const canUndo = lastId !== undefined && !locked && !undoShortlisted;

  /**
   * Films that matched leave this phone: gone from the stack at once if behind the mounted
   * cards, under the scrim if mounted. A film this phone had answered (an undo brought it back,
   * or the vote was still in flight) counts as answered again, and its super like as spent.
   */
  const leave = useCallback(
    (ids: readonly number[]) => {
      const { mounted, buffer } = stack.getState();
      for (const card of [...mounted, ...buffer]) {
        if (!ids.includes(card.title_id)) continue;
        if (thrown.has(card.title_id) && !answered.has(card.title_id)) {
          const spent = refunded.delete(card.title_id);
          answered.add(card.title_id);
          answerer.redone(spent);
          setSuperLikesLeft(answerer.superLikesLeft());
          setCount(answerer.count());
        }
        thrown.set(card.title_id, card);
      }
      stack.getState().removeTitles(ids);
    },
    [stack, thrown, answered, refunded, answerer],
  );
  useEffect(() => {
    const ids = [...shortlist.known];
    if (ids.length === 0) return;
    if (!shortlist.active) {
      // The stack and the answer counts are synchronised with the shortlist, an external store.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      leave(ids);
      return;
    }
    const timer = setTimeout(() => leave(ids), duration.fast);
    return () => clearTimeout(timer);
  }, [shortlist.known, shortlist.active, leave]);

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
        } else if (event.type === 'undo_locked') {
          // The card that came back matched: it leaves again, with no message. After the room
          // moved on the layout follows the room instead.
          if (!live.getState().locked) leave([event.title_id]);
        } else if (event.type === 'finale' || event.type === 'closed') lock();
        else if (event.type === 'no_super_likes') {
          // The server has no vote for this film: Undo has nothing to take back there.
          undoer.markNotRecorded(event.title_id);
          if (!refunded.has(event.title_id)) {
            refunded.add(event.title_id);
            answerer.giveBackSuperLike();
            setSuperLikesLeft(answerer.superLikesLeft());
          }
        } else if (event.type === 'dropped') {
          // Never recorded: Undo would take back an earlier film's vote.
          undoer.markNotRecorded(event.title_id);
        } else if (event.type === 'card_not_dealt') {
          undoer.markNotRecorded(event.title_id);
          stack.getState().onDeckUpdated();
        }
      }),
    [roomId, answerer, stack, lock, undoer, refunded, leave, live],
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
      doneSent.current = true;
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
    count,
    undo,
    canUndo,
    /** The last card answered is on the shortlist: Undo is off, and says why. */
    undoShortlisted,
    /** The shortlisted beat is playing: cards take no touch. */
    beating: shortlist.active,
    returning,
    superLikesLeft,
    waitingVotes,
    locked,
    seenRule,
    online,
    imageBase: config?.tmdb_image_base,
  };
}

export type Swipe = ReturnType<typeof useSwipe>;
