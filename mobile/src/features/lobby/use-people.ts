import { useEffect, useMemo, useSyncExternalStore } from 'react';

import { api } from '@/api';
import { useOnline } from '@/features/network';
import { useRoomGenres } from '@/features/room';
import { reportError } from '@/lib/sentry';

import { addSkippedPerson, createPeopleSearch, type AddPerson, type SkippedPerson } from './people';
import { useTonightDraft } from './tonight-draft';

export function usePeopleSearch(text: string, language: string) {
  const online = useOnline();
  const controller = useMemo(
    () =>
      createPeopleSearch({
        search: (query) =>
          api.searchPeople({ query, language: language.startsWith('fr') ? 'fr' : 'en' }),
        report: (status) => reportError(new Error(`search_people: ${status}`)),
      }),
    [language],
  );
  useEffect(() => () => controller.dispose(), [controller]);
  useEffect(() => controller.setOnline(online), [controller, online]);
  useEffect(() => controller.setText(text), [controller, text]);
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  return { ...state, retry: controller.retry };
}

/**
 * The people this player skips tonight: the draft over what the seat holds, and the tap on a
 * result. The sheet that uses it never resets the draft: the screen under it owns that.
 */
export function useSkippedPeople(roomId: string | undefined) {
  const read = useRoomGenres(roomId);
  const draft = useTonightDraft(roomId);
  const people: SkippedPerson[] = draft.people ?? read.data?.skips.people ?? [];
  const add = (person: SkippedPerson): AddPerson['result'] => {
    const next = addSkippedPerson(people, person);
    if (next.result === 'added') draft.set({ people: next.people });
    return next.result;
  };
  return { people, add };
}
