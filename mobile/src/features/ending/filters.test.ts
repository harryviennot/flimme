import i18n from '@/i18n';

import { tonightsFilters } from './filters';

const providers = [
  { provider_id: 8, name: 'Netflix', logo_path: null, display_priority: 1 },
  { provider_id: 119, name: 'Prime Video', logo_path: null, display_priority: 2 },
  { provider_id: 381, name: 'Canal+', logo_path: null, display_priority: 3 },
];

const room = {
  provider_ids: [381, 8],
  runtime_max: null,
  seen_rule: 'allow_rewatch',
  quality: 'standard',
  max_age: null,
} as const;

const en = i18n.getFixedT('en', 'ending');
const fr = i18n.getFixedT('fr', 'ending');
const labels = (list: ReturnType<typeof tonightsFilters>) => list.tags.map((tag) => tag.label);

describe('tonightsFilters', () => {
  it('lists up to two services in the country order, then the rest as a count', () => {
    const wide = { ...room, provider_ids: [381, 8, 119] };
    const out = tonightsFilters(wide, providers, en, 'en');
    expect(labels(out)).toEqual(['Netflix', 'Prime Video', '+1']);
    expect(out.tags[0]?.icon).toBe('tv');
    expect(out.tags[1]?.icon).toBeUndefined();
  });

  it('falls back to a count while the providers are not loaded', () => {
    expect(labels(tonightsFilters(room, undefined, en, 'en'))).toEqual(['2 services']);
    expect(labels(tonightsFilters({ ...room, provider_ids: [8] }, undefined, fr, 'fr'))).toEqual([
      '1 plateforme',
    ]);
  });

  it('shows the runtime and the age cap, and nothing for a room without filters', () => {
    const narrow = { ...room, provider_ids: [], runtime_max: 105, max_age: 12 };
    expect(labels(tonightsFilters(narrow, providers, en, 'en'))).toEqual([
      'Under 1 h 45',
      'Ages 12+',
    ]);
    expect(labels(tonightsFilters({ ...room, provider_ids: [] }, providers, en, 'en'))).toEqual([]);
  });

  it('says all ages for a cap of 0', () => {
    const out = tonightsFilters({ ...room, provider_ids: [], max_age: 0 }, providers, fr, 'fr');
    expect(labels(out)).toEqual(['Tous publics']);
  });

  it('shows the seen rule only for hide_seen and the quality only when it narrows', () => {
    const out = tonightsFilters(
      { ...room, provider_ids: [], seen_rule: 'hide_seen', quality: 'hidden_gems' },
      providers,
      en,
      'en',
    );
    expect(labels(out)).toEqual(['Unseen only', 'Hidden gems']);
    const guilty = tonightsFilters(
      { ...room, provider_ids: [], quality: 'guilty_pleasures' },
      providers,
      fr,
      'fr',
    );
    expect(labels(guilty)).toEqual(['Plaisirs coupables']);
  });

  it('reads every service name in full for screen readers', () => {
    const wide = { ...room, provider_ids: [381, 8, 119], runtime_max: 120 };
    const out = tonightsFilters(wide, providers, en, 'en');
    expect(out.a11y).toBe("Tonight's filters: Netflix, Prime Video, Canal+, and Under 2 h 00");
  });
});
