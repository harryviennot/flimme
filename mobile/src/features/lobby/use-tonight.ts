import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Platform } from 'react-native';

import { api } from '@/api';
import { showToast } from '@/components/ui/toast';
import { useOnline } from '@/features/network';
import { GENRES_KEY, SEATS_KEY, useRoomGenres } from '@/features/room';
import { errorFeedback } from '@/lib/feedback';
import { reportError } from '@/lib/sentry';

import {
  allGenreChips,
  genreChips,
  GENRE_CAP,
  genreName,
  outTonightSet,
  reconcileTonight,
  ROOM_OUT_GENRES_MAX,
  saveTonight,
  SKIP_GENRES_MAX,
  toggleGenre,
  toggleSkip,
  tonightChanged,
} from './genres';
import { useGenres } from './queries';
import { useTonightDraft } from './tonight-draft';

type WantsNote = { kind: 'cap' } | { kind: 'pickOut'; name: string } | null;
type GenresNote = 'cap' | 'roomLimit' | null;

export type TonightSave =
  'close' | 'locked' | 'pickOut' | 'roomLimit' | 'stale' | 'bug' | 'failed' | 'offline' | 'busy';

const announce = (text: string) => {
  if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(text);
};

/**
 * What the genre step and the lobby's genres sheet share (genre-step.md#not-tonight-m670-and-m671):
 * the draft over what the seat holds, the pick and skip taps with their notes, and the save with
 * every answer mapped. The screens only draw and move.
 */
export function useTonight(roomId: string | undefined, language: string) {
  const { t } = useTranslation('lobby');
  const { t: tc } = useTranslation();
  const client = useQueryClient();
  const online = useOnline();
  const read = useRoomGenres(roomId);
  const names = useGenres();
  const draft = useTonightDraft(roomId);
  const [wantsNote, setWantsNote] = useState<WantsNote>(null);
  const [genresNote, setGenresNote] = useState<GenresNote>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  const ready = read.isSuccess && names.isSuccess;
  const failed = !ready && (read.isError || names.isError || !online);
  const loading = !read.isSuccess && !read.isError;

  const data = read.data;
  const offeredIds = new Set(data?.options.map((option) => option.genre_id));
  const roomOut = [
    ...new Set([
      ...(data?.out ?? []),
      ...(data?.options.filter((option) => option.out).map((option) => option.genre_id) ?? []),
    ]),
  ];
  const startPicks = (data?.mine ?? []).filter((id) => offeredIds.has(id) && !roomOut.includes(id));
  const startSkips = data?.skips.genre_ids ?? [];
  const skips = draft.skips ?? startSkips;
  // A pick in a genre that is out leaves the draft, saved picks and cap alike.
  const picks = (draft.picks ?? startPicks).filter((id) => !roomOut.includes(id));
  const outTonight = outTonightSet(roomOut, skips);

  // Someone else skipped a genre this player picked: say so until the next tap, no toast.
  const lastPicks = useRef<number[]>([]);
  useEffect(() => {
    const gone = lastPicks.current.filter((id) => roomOut.includes(id) && !skips.includes(id));
    lastPicks.current = picks;
    if (gone.length === 0 || !names.data) return;
    const genre = names.data.find((g) => g.id === gone[0]);
    const name = genre ? genreName(genre, language) : '';
    const next = { kind: 'pickOut', name } as const;
    setWantsNote(next);
    announce(t('prefs.pickOut', { name }));
    if (draft.picks !== null) draft.set({ picks });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomOut.join(','), picks.join(',')]);

  // Leaving without saving drops the draft. (Start's toast is the layout's, and runs first.)
  const { reset } = draft;
  useEffect(() => reset, [reset]);

  const changed = ready && tonightChanged({ picks, startPicks, skips, startSkips });
  const unsavedNow = useRef(false);
  useEffect(() => {
    if (unsavedNow.current !== changed) {
      unsavedNow.current = changed;
      draft.setUnsaved(changed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changed]);

  const offered =
    ready && data && names.data
      ? genreChips(data.options, names.data, language, picks, startPicks)
      : [];
  const allGenres = names.data ? allGenreChips(names.data, language) : [];

  const nameOf = (id: number) => {
    const genre = names.data?.find((g) => g.id === id);
    return genre ? genreName(genre, language) : '';
  };

  const togglePick = (id: number) => {
    if (roomOut.includes(id) || skips.includes(id)) return;
    const next = toggleGenre(picks, id);
    draft.set({ picks: next.selection });
    setWantsNote(next.capped ? { kind: 'cap' } : null);
    if (next.capped) announce(t('genresSheet.cap', { max: GENRE_CAP }));
  };

  const toggleSkipGenre = (id: number) => {
    const next = toggleSkip({ picks, skips }, id, roomOut);
    if (next.capped || next.roomLimit) {
      setGenresNote(next.capped ? 'cap' : 'roomLimit');
      announce(
        next.capped
          ? t('prefs.notTonight.genreCap', { max: SKIP_GENRES_MAX })
          : t('prefs.notTonight.roomLimit', { max: ROOM_OUT_GENRES_MAX }),
      );
      return;
    }
    draft.set({ picks: next.picks, skips: next.skips });
    setGenresNote(null);
    setWantsNote(null);
    if (next.pickMoved) announce(t('prefs.a11y.pickMoved', { name: nameOf(id) }));
  };

  const retry = () => {
    void read.refetch();
    void names.refetch();
  };

  const finish = () => {
    draft.reset();
    void client.invalidateQueries({ queryKey: GENRES_KEY(roomId ?? '') });
    void client.invalidateQueries({ queryKey: SEATS_KEY(roomId ?? '') });
  };

  /** Continue or Done. The screen moves on `close` and `locked`; everything else keeps it open. */
  const save = async (): Promise<TonightSave> => {
    if (busy.current) return 'busy';
    if (changed && !online) {
      showToast({ tone: 'warn', title: t('errors.genres') });
      return 'offline';
    }
    busy.current = true;
    setSaving(true);
    const outcome = await saveTonight(
      { roomId: roomId ?? '', picks, startPicks, skips, startSkips },
      {
        setSeatSkips: (args) => api.setSeatSkips(args),
        setSeatPrefs: (args) => api.setSeatPrefs(args),
      },
    );
    busy.current = false;
    setSaving(false);
    switch (outcome.kind) {
      case 'close':
        finish();
        return 'close';
      case 'locked':
        showToast({
          tone: 'info',
          title: t('genresLocked.title'),
          message: t('genresLocked.message'),
        });
        finish();
        return 'locked';
      case 'pickOut':
        // The skips went through: the draft keeps them, the read shows the pick gone.
        void read.refetch();
        return 'pickOut';
      case 'roomLimit': {
        errorFeedback();
        showToast({
          tone: 'warn',
          title: t('prefs.errors.roomLimit', { max: outcome.max }),
        });
        const fresh = await read.refetch();
        const out = fresh.data?.out ?? [];
        const next = reconcileTonight({ picks, skips }, out, true);
        draft.set({ picks: next.picks, skips: next.skips });
        return 'roomLimit';
      }
      case 'stale':
        draft.reset();
        void read.refetch();
        showToast({ tone: 'warn', title: t('errors.genresStale') });
        return 'stale';
      case 'bug':
        reportError(new Error(`genres: ${outcome.reason}`));
        errorFeedback();
        showToast({ tone: 'warn', title: tc('errors.generic.title') });
        return 'bug';
      case 'failed':
        showToast({ tone: 'warn', title: t('errors.genres') });
        return 'failed';
    }
  };

  const wantsText = !wantsNote
    ? null
    : wantsNote.kind === 'cap'
      ? t('genresSheet.cap', { max: GENRE_CAP })
      : t('prefs.pickOut', { name: wantsNote.name });
  const genresText =
    genresNote === 'cap'
      ? t('prefs.notTonight.genreCap', { max: SKIP_GENRES_MAX })
      : genresNote === 'roomLimit'
        ? t('prefs.notTonight.roomLimit', { max: ROOM_OUT_GENRES_MAX })
        : null;

  return {
    read,
    ready,
    failed,
    loading,
    online,
    offered,
    allGenres,
    outTonight,
    picks,
    skips,
    startPicks,
    startSkips,
    changed,
    wantsText,
    genresText,
    togglePick,
    toggleSkip: toggleSkipGenre,
    retry,
    save,
    saving,
  };
}
