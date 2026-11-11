// The people search of Not tonight (skip-people.md). Privacy: the text a player types never leaves
// the call. It is kept in no state a screen can read, sent to no log, no analytics event and no
// Sentry report; a report for a bad answer carries the status only. The search POSTs (the
// contract's `searchPeople`), so the text is never in a URL either.
import { ApiError, type PersonResult, type SearchPeopleResult } from '@flimme/contract';
import { SKIP_PEOPLE_MAX } from './genres';

/** The call goes this long after the last keystroke (a constant here, not a motion token). */
export const SEARCH_DEBOUNCE_MS = 300;
export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 60;

export type SkippedPerson = { id: number; name: string };

export type PeopleSearchState = {
  /** `null` until a first answer (skeleton rows while `busy`); `[]` is "nobody by that name". */
  people: readonly PersonResult[] | null;
  /** A search is waiting or in flight. Earlier rows stay while it is. */
  busy: boolean;
  error: 'offline' | 'failed' | null;
};

export type PeopleSearchDeps = {
  search: (query: string) => Promise<SearchPeopleResult>;
  /** A status, never the text. */
  report: (status: string) => void;
};

const IDLE: PeopleSearchState = { people: null, busy: false, error: null };

/**
 * The search as a small store, so its rules are tested without rendering: under 2 characters no
 * call, 300 ms after the last keystroke one call, only the newest answer is drawn, offline waits
 * and searches the current text once back.
 */
export function createPeopleSearch(deps: PeopleSearchDeps) {
  let state: PeopleSearchState = IDLE;
  let text = '';
  let online = true;
  let seq = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();

  const set = (next: PeopleSearchState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  const stop = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    seq += 1;
  };
  const usable = () => text.length >= SEARCH_MIN_LENGTH && text.length <= SEARCH_MAX_LENGTH;

  const run = () => {
    stop();
    if (!usable()) return set(IDLE);
    if (!online) return set({ people: state.people, busy: false, error: 'offline' });
    const mine = seq;
    set({ people: state.people, busy: true, error: null });
    deps.search(text).then(
      (answer) => {
        if (mine !== seq) return;
        if (answer.status === 'ok') return set({ people: answer.people, busy: false, error: null });
        if (answer.status === 'invalid') deps.report('invalid');
        set({ people: state.people, busy: false, error: 'failed' });
      },
      (error: unknown) => {
        if (mine !== seq) return;
        const offline = error instanceof ApiError && error.kind === 'network';
        set({ people: state.people, busy: false, error: offline ? 'offline' : 'failed' });
      },
    );
  };

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setText(raw: string) {
      text = raw.trim();
      stop();
      if (!usable()) return set(IDLE);
      if (!online) return set({ people: state.people, busy: false, error: 'offline' });
      set({ people: state.people, busy: true, error: null });
      timer = setTimeout(run, SEARCH_DEBOUNCE_MS);
    },
    setOnline(next: boolean) {
      if (online === next) return;
      online = next;
      if (!usable()) return;
      if (next && state.error === 'offline') run();
      else if (!next) {
        stop();
        set({ people: state.people, busy: false, error: 'offline' });
      }
    },
    retry: run,
    dispose() {
      stop();
      listeners.clear();
    },
  };
}

/** The one film a result shows under the name, or `null` for no line. */
export function knownForOf(person: PersonResult): { title: string; year: number | null } | null {
  // The contract says a film is always there, but a person with no film must draw no line.
  const film = person.known_for as PersonResult['known_for'] | null | undefined;
  return film?.title ? { title: film.title, year: film.year ?? null } : null;
}

export type AddPerson = { people: SkippedPerson[]; result: 'added' | 'already' | 'capped' };

/** A tap on a result: adds it to the list, or says why not (it is there; the cap of 3 is full). */
export function addSkippedPerson(
  people: readonly SkippedPerson[],
  person: SkippedPerson,
): AddPerson {
  if (people.some((p) => p.id === person.id)) return { people: [...people], result: 'already' };
  if (people.length >= SKIP_PEOPLE_MAX) return { people: [...people], result: 'capped' };
  return { people: [...people, { id: person.id, name: person.name }], result: 'added' };
}
