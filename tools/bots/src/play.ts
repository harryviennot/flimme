// What a bot does once it is in a room: swipe with its personality until the room leaves
// `swiping`, and lock in a ballot when a Final Cut opens. Kept apart from the sign-in and the
// Realtime channels (bot.ts) so it is tested with a fake `api`, `sleep` and clock.
//
// It does not depend on the shortlist: it keeps swiping until the room's state changes. Rule 7:
// the only lines it logs are "bot N liked a film" and "bot N locked in".
import type { FinaleKind, LivePresence, VoteAnswer, createApi } from '@flimme/contract';

import {
  decideAnswer,
  lockDelay,
  nextDelay,
  planBallot,
  type Personality,
  type Random,
} from './personality';

export type PlayApi = Pick<
  ReturnType<typeof createApi>,
  'myNextCards' | 'requestCards' | 'castVote' | 'undoLastVote' | 'titleCards' | 'castBallot'
>;

export type FinaleRound = {
  round_id: string;
  title_ids: number[];
  kind: FinaleKind;
  closes_at: string;
};

export type PlayDeps = {
  api: PlayApi;
  roomId: string;
  memberId: string;
  label: string;
  personality: Personality;
  random: Random;
  sleep: (ms: number) => Promise<unknown>;
  /** Runs `fn` after `ms`; returns a way to cancel it. */
  schedule?: (fn: () => void, ms: number) => () => void;
  now?: () => number;
  log: (line: string) => void;
  setPresence: (next: LivePresence) => void;
  swipeMs: number | null | 'off';
  likeRate: number | null;
  initialState: string;
};

export function createPlayer(deps: PlayDeps) {
  const { api, roomId, memberId, label, personality, random, sleep, log } = deps;
  const schedule =
    deps.schedule ??
    ((fn: () => void, ms: number) => {
      const timer = setTimeout(fn, ms);
      return () => clearTimeout(timer);
    });
  const now = deps.now ?? Date.now;
  let presence: LivePresence = { swipe_count: 0, done: false };
  let stopped = false;
  let swiping = false;
  let roomState = deps.initialState;
  const state = { superLikesLeft: 2, likeRateOverride: deps.likeRate };
  const cancels = new Set<() => void>();
  const lockedRounds = new Set<string>();

  const setPresence = (next: LivePresence) => {
    presence = next;
    deps.setPresence(presence);
  };

  async function swipeLoop() {
    if (deps.swipeMs === 'off' || swiping) return;
    swiping = true;
    const baseMs = deps.swipeMs ?? undefined;
    try {
      while (!stopped && roomState === 'swiping') {
        const cards = await api.myNextCards({ room_id: roomId, limit: 10 });
        if (cards.length === 0) {
          // Out of cards: say so, ask for more, and look again until the room moves on.
          setPresence({ ...presence, done: true });
          await api.requestCards({ room_id: roomId }).catch(() => {});
          await sleep(3000);
          continue;
        }
        setPresence({ ...presence, done: false });
        for (const card of cards) {
          if (stopped || roomState !== 'swiping') return;
          await sleep(nextDelay(personality, random, baseMs));
          if (stopped || roomState !== 'swiping') return;
          let answer = decideAnswer(personality, card, state, random);
          let result = await vote(card.title_id, answer);
          if (result === 'closed') return;
          if (result === 'no_super_likes') {
            state.superLikesLeft = 0;
            answer = 'like';
            result = await vote(card.title_id, answer);
            if (result === 'closed') return;
          }
          if (result !== 'ok') continue;
          if (answer === 'super_like') state.superLikesLeft -= 1;
          if (answer === 'like' || answer === 'super_like') log(`${label} liked a film`);
          setPresence({ ...presence, swipe_count: presence.swipe_count + 1 });
          // Changing its mind: take the vote back and answer again.
          if (random() < personality.undoChance) {
            const undone = await api.undoLastVote({ room_id: roomId, member_id: memberId });
            if (undone.status === 'ok') {
              setPresence({ ...presence, swipe_count: Math.max(0, presence.swipe_count - 1) });
              await sleep(nextDelay(personality, random, baseMs));
              const again = decideAnswer(personality, card, state, random);
              const second = await vote(card.title_id, again === 'super_like' ? 'like' : again);
              if (second === 'ok')
                setPresence({ ...presence, swipe_count: presence.swipe_count + 1 });
              if (second === 'closed') return;
            }
          }
        }
      }
    } catch {
      // A failed call ends this round; the next state_changed starts it again.
    } finally {
      swiping = false;
    }
  }

  async function vote(titleId: number, answer: VoteAnswer) {
    const result = await api.castVote({
      room_id: roomId,
      title_id: titleId,
      answer,
      member_id: memberId,
      client_at: new Date().toISOString(),
    });
    if (
      (result.status === 'ok' || result.status === 'closed') &&
      result.state &&
      result.state !== 'swiping'
    )
      roomState = result.state;
    return result.status;
  }

  // The Final Cut: rank by taste, veto sometimes (a ranked vote has no veto), lock in at a random
  // moment inside the window, or never. A bot that never hears `finale_started` (it joined late)
  // or whose film lookup is refused simply does not lock in: fine for a test tool.
  async function playFinale(round: FinaleRound) {
    if (lockedRounds.has(round.round_id)) return;
    lockedRounds.add(round.round_id);
    const windowMs = Math.max(0, new Date(round.closes_at).getTime() - now());
    const wait = lockDelay(personality, windowMs, random);
    if (wait === null) return;
    const cards = await api.titleCards({ room_id: roomId, title_ids: round.title_ids });
    if (cards.status !== 'ok') return;
    const ballot = planBallot(personality, round.kind, cards.cards, random);
    const cancel = schedule(() => {
      cancels.delete(cancel);
      if (stopped) return;
      void api
        .castBallot({
          round_id: round.round_id,
          ranking: ballot.ranking,
          veto: ballot.veto,
          member_id: memberId,
        })
        .then((result) => {
          if (result.status === 'ok') log(`${label} locked in`);
        })
        .catch(() => {});
    }, wait);
    cancels.add(cancel);
  }

  return {
    /** The room's state changed (a `state_changed` event): start swiping when it is `swiping`. */
    setState(next: string) {
      roomState = next;
      if (roomState === 'swiping') void swipeLoop();
    },
    swipeLoop,
    playFinale,
    stop() {
      stopped = true;
      for (const cancel of cancels) cancel();
    },
  };
}
