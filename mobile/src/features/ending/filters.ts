import type { CountryProvider, RoomRow } from '@flimme/contract';
import type { TFunction } from 'i18next';

import type { IconName } from '@/components/ui/icon';
import { formatList } from '@/features/lobby/names';
import { formatRuntime } from '@/features/swipe/card-props';

// Tonight's filters as the done card shows them (swipe.md#the-done-card-nothing-left): a tag
// for each filter that narrows the deck, none for one that doesn't, so no empty line is left.

/** Service tags shown by name before the rest fold into "+N". */
const NAMED_SERVICES = 2;

export type FilterTag = { id: string; label: string; icon?: IconName };
export type TonightsFilters = {
  tags: FilterTag[];
  /** One sentence for screen readers, with every service name in full. */
  a11y: string;
};

export type FilterRoom = Pick<RoomRow, 'runtime_max' | 'seen_rule' | 'quality' | 'max_age'> & {
  provider_ids: readonly number[];
};

export function tonightsFilters(
  room: FilterRoom,
  providers: readonly CountryProvider[] | undefined,
  t: TFunction<'ending'>,
  language: string,
): TonightsFilters {
  const tags: FilterTag[] = [];
  const spoken: string[] = [];

  const wanted = new Set(room.provider_ids);
  // The country's list is in display order; an id it doesn't know is skipped.
  const names = (providers ?? []).filter((p) => wanted.has(p.provider_id)).map((p) => p.name);
  if (names.length > 0) {
    names.slice(0, NAMED_SERVICES).forEach((name, i) => {
      tags.push({ id: `service-${i}`, label: name, icon: i === 0 ? 'tv' : undefined });
    });
    if (names.length > NAMED_SERVICES) {
      tags.push({
        id: 'more-services',
        label: t('filters.moreServices', { count: names.length - NAMED_SERVICES }),
      });
    }
    spoken.push(...names);
  } else if (room.provider_ids.length > 0) {
    const label = t('filters.services', { count: room.provider_ids.length });
    tags.push({ id: 'services', label, icon: 'tv' });
    spoken.push(label);
  }

  const extra = (id: string, label: string, icon: IconName) => {
    tags.push({ id, label, icon });
    spoken.push(label);
  };
  if (room.runtime_max !== null) {
    const duration = formatRuntime(room.runtime_max, language);
    extra('runtime', t('filters.runtime', { duration }), 'clock');
  }
  if (room.max_age !== null) {
    extra(
      'age',
      room.max_age === 0 ? t('filters.allAges') : t('filters.age', { age: room.max_age }),
      'shield',
    );
  }
  if (room.seen_rule === 'hide_seen') extra('seen', t('filters.hideSeen'), 'eye');
  if (room.quality === 'hidden_gems') extra('quality', t('filters.hiddenGems'), 'star');
  if (room.quality === 'guilty_pleasures') extra('quality', t('filters.guiltyPleasures'), 'star');

  return { tags, a11y: t('a11y.filters', { list: formatList(spoken, language) }) };
}
