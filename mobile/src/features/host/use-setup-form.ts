import { useState } from 'react';

import { useMyProfile } from '@/features/profile';

import { useCountryProviders, useMyProviders } from './queries';
import {
  DEFAULT_AGE,
  DEFAULT_TIME,
  initialSelection,
  selectionChanged,
  toRoomSettings,
  type AgeChoice,
  type TimeChoice,
} from './settings';

/**
 * The state both setup screens share (host setup and Play alone setup): the player's country, the
 * services that country lists, the selection (starting on the saved ids the country lists), the
 * time budget and the age cap, and the settings they make.
 */
export function useSetupForm() {
  const profile = useMyProfile();
  const country = profile.data?.country ?? null;
  const providers = useCountryProviders(country);
  const mine = useMyProviders(Boolean(country));

  // The player's own taps; until they tap, the selection is the start.
  const [picked, setPicked] = useState<number[] | null>(null);
  const [time, setTime] = useState<TimeChoice>(DEFAULT_TIME);
  const [age, setAge] = useState<AgeChoice>(DEFAULT_AGE);

  const listed = providers.data ?? [];
  const start = initialSelection(
    mine.data ?? [],
    listed.map((p) => p.provider_id),
  );
  const selection = picked ?? start;
  const ready = providers.isSuccess && mine.isSuccess;
  const failed = providers.isError || mine.isError;

  const toggle = (id: number) =>
    setPicked(selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id]);

  return {
    profile,
    country,
    providers,
    mine,
    listed,
    start,
    selection,
    ready,
    failed,
    toggle,
    time,
    setTime,
    age,
    setAge,
    changed: selectionChanged(start, selection),
    settings: toRoomSettings(time, age),
    retry: () => {
      void providers.refetch();
      void mine.refetch();
    },
  };
}
