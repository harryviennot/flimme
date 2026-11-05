import type { NextCard, RequestCardsAnswer } from '@flimme/contract';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { posterUrl } from './poster-url';

// The card stack (app-structure.md#the-card-stack): 3 mounted cards, about 10 behind them as
// plain data, refilled and refreshed without ever showing a card the server replaced. It is not
// persisted and not a TanStack query: the deck changes under the phone. Rule 5: nothing here
// makes a swipe wait for the network; `answer()` is synchronous.

/** Cards drawn at once. */
export const MOUNTED_COUNT = 3;
/** Cards kept behind the mounted ones (a starting value). */
export const BUFFER_COUNT = 10;
/** What one fetch asks for: the mounted cards plus the buffer. */
export const FETCH_LIMIT = MOUNTED_COUNT + BUFFER_COUNT;
/** With this many unanswered cards left on the phone (mounted included), ask for more. */
export const REFILL_AT = 5;
/** Ask again after this long if nothing arrived (the server deals its fallback at 8 seconds). */
export const REQUEST_RETRY_MS = 8000;
/** The posters of the cards at these places (1-based 4 to 6) are prefetched. */
const PREFETCH_FROM = MOUNTED_COUNT;
const PREFETCH_TO = MOUNTED_COUNT + 3;

export type StackStatus = 'ready' | 'loading' | 'waiting_offline' | 'empty';

/** What `api.request_cards` answers; `{ status }` is accepted too, for wrappers that wrap it. */
export type RequestCardsResult =
  RequestCardsAnswer | { status: RequestCardsAnswer; liked?: number };

export type StackDeps = {
  /** `api.myNextCards({ room_id, limit, member_id })`. */
  fetchCards(limit: number): Promise<NextCard[]>;
  requestCards(): Promise<RequestCardsResult>;
  /** `Image.prefetch(urls, 'memory-disk')`. */
  prefetch(urls: string[]): void;
  /** The vote queue holds an answer for this film, or it was answered this session. */
  isAnswered(titleId: number): boolean;
  now(): number;
};

export type StackOptions = {
  /** `app_config.tmdb_image_base`; without it nothing is prefetched. */
  imageBase?: string;
  /** The screen's width in points: w780 posters from 600 up. */
  screenWidth: number;
};

export type AnsweredCard = { card: NextCard; dwellMs: number; flipped: boolean };

export type CardStackState = {
  /** Up to 3 cards, the first is on top. */
  mounted: NextCard[];
  /** Plain data behind the mounted cards. */
  buffer: NextCard[];
  status: StackStatus;
  /** A `deck_updated` arrived and the refetch hasn't returned: the buffer must not be shown. */
  stale: boolean;
  /** Films with a like in the room, from the last `done` answer (the done card shows it), else null. */
  liked: number | null;
  /** The top card shows its back. */
  flipped: boolean;
  /** How many times a card was turned to its back, for the card 3 hint (it leaves at the first). */
  flips: number;
  /** When the top card reached the top (`deps.now()`), or null with no card. */
  shownAt: number | null;
  start: () => void;
  stop: () => void;
  /** Takes the top card off; the vote queue records the returned dwell time and flip state. */
  answer: () => AnsweredCard | null;
  /** Undo: the last answered card is on top again, front side up, its dwell starting over. */
  putBack: (card: NextCard) => void;
  /** Films that matched leave the phone: mounted or behind, the cards behind move up. */
  removeTitles: (titleIds: readonly number[]) => void;
  setFlipped: (flipped: boolean) => void;
  onDeckUpdated: () => void;
  onOnline: () => void;
  onOffline: () => void;
};

export type CardStack = StoreApi<CardStackState>;

function statusOf(answer: RequestCardsResult): RequestCardsAnswer {
  return typeof answer === 'string' ? answer : answer.status;
}

/** One stack per room and seat. Tests pass fakes; M6.9 passes the real wrappers. */
export function createCardStack(deps: StackDeps, options: StackOptions): CardStack {
  let online = true;
  let fetchFailed = false;
  let exhausted = false;
  let loaded = false;
  let closed = false;
  let fetchSeq = 0;
  let requestTimer: ReturnType<typeof setTimeout> | null = null;
  let failureTimer: ReturnType<typeof setTimeout> | null = null;
  const prefetched = new Set<string>();

  const store = createStore<CardStackState>()((set, get) => {
    function status(s: Pick<CardStackState, 'mounted'>): StackStatus {
      if (s.mounted.length > 0) return 'ready';
      if (!online || fetchFailed) return 'waiting_offline';
      if (exhausted && !get().stale) return 'empty';
      return 'loading';
    }

    function commit(patch: Partial<CardStackState>) {
      const next = { ...get(), ...patch };
      set({ ...patch, status: status(next) });
    }

    function prefetchPosters() {
      const { mounted, buffer, stale } = get();
      if (stale) return;
      const urls = [...mounted, ...buffer]
        .slice(PREFETCH_FROM, PREFETCH_TO)
        .map((card) => posterUrl(options.imageBase, card.poster_path, options.screenWidth))
        .filter((url): url is string => url !== null && !prefetched.has(url));
      if (urls.length === 0) return;
      urls.forEach((url) => prefetched.add(url));
      deps.prefetch(urls);
    }

    function clearRequestTimer() {
      if (requestTimer) clearTimeout(requestTimer);
      requestTimer = null;
    }

    async function requestMore() {
      // The timer is set before the call, so a slow answer never lets a second call out early.
      requestTimer = setTimeout(() => {
        requestTimer = null;
        check();
      }, REQUEST_RETRY_MS);
      let answer: RequestCardsAnswer;
      let result: RequestCardsResult;
      try {
        result = await deps.requestCards();
        answer = statusOf(result);
      } catch {
        return; // the retry timer asks again
      }
      if (answer === 'done') {
        // Nothing left to deal for this seat (M6.29): the deck is dry, as after an empty refetch.
        // The retry timer stays, so a later deck_updated or the next ask still finds new cards.
        exhausted = true;
        const liked = typeof result === 'object' ? result.liked : undefined;
        commit({ liked: liked ?? null });
      } else if (answer === 'closed') {
        closed = true;
        exhausted = true;
        clearRequestTimer();
        commit({});
      } else if (answer === 'ok' || answer === 'enough') {
        void refetch(true);
      } // 'queued': wait for deck_updated
    }

    /** Asks for more cards when the phone is down to REFILL_AT, at most every 8 seconds. */
    function check() {
      if (!loaded || !online || closed || get().stale) return;
      const { mounted, buffer } = get();
      if (mounted.length + buffer.length > REFILL_AT) {
        clearRequestTimer();
        return;
      }
      if (requestTimer) return;
      void requestMore();
    }

    async function refetch(afterRequest: boolean) {
      const seq = ++fetchSeq;
      let fetched: NextCard[];
      try {
        fetched = await deps.fetchCards(FETCH_LIMIT);
      } catch {
        if (seq !== fetchSeq) return;
        fetchFailed = true;
        commit({});
        if (!failureTimer) {
          failureTimer = setTimeout(() => {
            failureTimer = null;
            if (online && fetchFailed) void refetch(false);
          }, REQUEST_RETRY_MS);
        }
        return;
      }
      if (seq !== fetchSeq) return; // a newer fetch is on its way, this one may be outdated
      fetchFailed = false;
      loaded = true;

      // Only what's behind the mounted cards is replaced; the mounted ones stay as they are.
      const { mounted } = get();
      const seen = new Set(mounted.map((card) => card.title_id));
      const fresh: NextCard[] = [];
      for (const card of fetched) {
        if (seen.has(card.title_id) || deps.isAnswered(card.title_id)) continue;
        seen.add(card.title_id);
        fresh.push(card);
      }
      const room = MOUNTED_COUNT - mounted.length;
      const nextMounted = [...mounted, ...fresh.slice(0, room)];
      exhausted = afterRequest && nextMounted.length === 0;
      commit({
        mounted: nextMounted,
        buffer: fresh.slice(room, room + BUFFER_COUNT),
        stale: false,
        liked: nextMounted.length > 0 ? null : get().liked,
        shownAt: mounted.length === 0 && nextMounted.length > 0 ? deps.now() : get().shownAt,
      });
      prefetchPosters();
      check();
    }

    return {
      mounted: [],
      buffer: [],
      status: 'loading',
      stale: false,
      liked: null,
      flipped: false,
      flips: 0,
      shownAt: null,

      start: () => void refetch(false),

      stop: () => {
        fetchSeq++;
        clearRequestTimer();
        if (failureTimer) clearTimeout(failureTimer);
        failureTimer = null;
      },

      answer: () => {
        const { mounted, buffer, stale, flipped, shownAt } = get();
        const top = mounted[0];
        if (!top) return null;
        const dwellMs = Math.max(0, deps.now() - (shownAt ?? deps.now()));
        let nextMounted = mounted.slice(1);
        let nextBuffer = buffer;
        // A stale buffer may hold cards the server replaced: never promote from it.
        const promoted = stale ? undefined : buffer[0];
        if (promoted) {
          nextMounted = [...nextMounted, promoted];
          nextBuffer = buffer.slice(1);
        }
        commit({
          mounted: nextMounted,
          buffer: nextBuffer,
          flipped: false,
          shownAt: nextMounted.length > 0 ? deps.now() : null,
        });
        prefetchPosters();
        check();
        return { card: top, dwellMs, flipped };
      },

      putBack: (card) => {
        const { mounted, buffer } = get();
        const others = mounted.filter((c) => c.title_id !== card.title_id);
        const all = [card, ...others];
        // The card that would be fourth goes back to the head of the buffer.
        exhausted = false;
        commit({
          mounted: all.slice(0, MOUNTED_COUNT),
          buffer: [
            ...all.slice(MOUNTED_COUNT),
            ...buffer.filter((c) => c.title_id !== card.title_id),
          ],
          flipped: false,
          liked: null,
          shownAt: deps.now(),
        });
      },

      removeTitles: (titleIds) => {
        const gone = new Set(titleIds);
        const { mounted, buffer, stale, flipped, shownAt } = get();
        if (![...mounted, ...buffer].some((c) => gone.has(c.title_id))) return;
        const keptMounted = mounted.filter((c) => !gone.has(c.title_id));
        const keptBuffer = buffer.filter((c) => !gone.has(c.title_id));
        // A stale buffer may hold cards the server replaced: never promote from it.
        const room = stale ? 0 : MOUNTED_COUNT - keptMounted.length;
        const nextMounted = [...keptMounted, ...keptBuffer.slice(0, room)];
        const topChanged = nextMounted[0]?.title_id !== mounted[0]?.title_id;
        commit({
          mounted: nextMounted,
          buffer: keptBuffer.slice(room),
          flipped: topChanged ? false : flipped,
          shownAt: topChanged ? (nextMounted.length > 0 ? deps.now() : null) : shownAt,
        });
        prefetchPosters();
        check();
      },

      setFlipped: (flipped) => {
        const { mounted, flipped: was, flips } = get();
        if (mounted.length === 0) return;
        set({ flipped, flips: flipped && !was ? flips + 1 : flips });
      },

      onDeckUpdated: () => {
        exhausted = false;
        commit({ stale: true });
        void refetch(false);
      },

      onOnline: () => {
        online = true;
        commit({});
        void refetch(false);
      },

      onOffline: () => {
        online = false;
        commit({});
      },
    };
  });

  return store;
}
