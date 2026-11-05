import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';

import { api } from '@/api';
import { hideToast, showToast } from '@/components/ui/toast';

import { hideFilm, unhideFilm } from './hidden';
import { refreshMyFilms } from './queries';
import { flushRemovals, startRemove } from './remove';

/** Remove with an Undo toast, bound to the api, the grid's hidden set and the screen's language. */
export function useRemoveFilm(): (titleId: number) => void {
  const { t } = useTranslation('myFilms');
  return (titleId) =>
    startRemove(titleId, {
      hide: hideFilm,
      unhide: unhideFilm,
      refresh: refreshMyFilms,
      remove: async (id) => (await api.removeMyFilm({ title_id: id })).status,
      toast: showToast,
      hideToast,
      copy: { removed: t('removed.title'), undo: t('removed.undo'), failed: t('removed.failed') },
    });
}

/** A removal waiting on its toast is sent as soon as the app leaves the foreground. */
export function useFlushRemovalsInBackground() {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status !== 'active') void flushRemovals();
    });
    return () => subscription.remove();
  }, []);
}
