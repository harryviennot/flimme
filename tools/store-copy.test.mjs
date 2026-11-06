// Roadmap M11.1: the store listing copy checker (tools/store-copy.mjs) and the real
// docs/store/listing.md. Each test builds a small listing that passes, then breaks one rule.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  CREDITS,
  FIELDS,
  LISTING_FILE,
  REQUIRED,
  checkListing,
  parseStoreFile,
} from './store-copy.mjs';

const STORE_NAME = { apple: 'App Store Connect', google: 'Google Play Console' };
const lang = (locale) => locale.slice(0, 2);

/** A value that passes every rule for this field and locale. */
function goodValue(store, field, locale) {
  const en = lang(locale) === 'en';
  const credits = () => `${CREDITS[lang(locale)].tmdb}\n${CREDITS[lang(locale)].justwatch}`;
  switch (`${store} ${field}`) {
    case 'apple Name':
    case 'google App name':
      return 'Flimme';
    case 'apple Subtitle':
      return en ? 'Pick a movie together' : 'Le film du soir, entre amis';
    case 'apple Promotional Text':
      return en ? 'Everyone swipes on their own phone.' : 'Chacun swipe sur son téléphone.';
    case 'apple Description':
    case 'google Full description':
      return en
        ? `Movie night, sorted.\n\n${credits()}`
        : `La soirée film, réglée.\n\n${credits()}`;
    case 'apple Keywords':
      return locale === 'en-GB'
        ? 'film,friends,swipe'
        : en
          ? 'movie,friends,swipe'
          : 'film,amis,swipe';
    case 'google Short description':
      return en
        ? 'Swipe with friends and find the film.'
        : 'Swipe avec tes amis et trouve le film.';
    case 'google Tags':
      return 'Movie\nEntertainment';
    default:
      throw new Error(`no fixture for ${store} ${field}`);
  }
}

/** Every required entry, valid, with `changes` applied: { 'apple fr-FR Subtitle': 'new value' }.
 * A change to undefined leaves the entry out. en-GB gets the same English as en-US but for its
 * keywords (Q1.3), so changing an en-US value also shows as en-GB drift: tests filter by rule. */
function listing(changes = {}) {
  const entries = [];
  for (const [store, locales] of Object.entries(REQUIRED)) {
    for (const [locale, fields] of Object.entries(locales)) {
      for (const field of fields) {
        const key = `${store} ${locale} ${field}`;
        if (key in changes && changes[key] === undefined) continue;
        const value = key in changes ? changes[key] : goodValue(store, field, locale);
        const { label, list } = FIELDS[store][field];
        entries.push({ store, locale, field, value, label, blocks: list ? 0 : 1 });
      }
    }
  }
  return entries;
}

const about = (problems, ...words) =>
  problems.filter((p) => words.every((w) => p.toLowerCase().includes(w.toLowerCase())));

test('the fixture listing passes, so each test below breaks exactly one thing', () => {
  assert.deepEqual(checkListing(listing()), []);
});

test('1. a value over its limit is a problem naming the store, locale and field; at the limit, none', () => {
  for (const [store, fields] of Object.entries(FIELDS)) {
    for (const [field, spec] of Object.entries(fields)) {
      if (!spec.limit) continue;
      const locale = store === 'apple' ? 'en-GB' : 'fr-FR';
      const unit = spec.unit === 'bytes' ? 'bytes' : 'characters';
      // "ab," repeated keeps keywords well formed; the limit is what the test is about.
      const fill = (n) => (spec.unit === 'bytes' ? 'abc,'.repeat(n).slice(0, n) : 'a'.repeat(n));
      const atLimit = checkListing(listing({ [`${store} ${locale} ${field}`]: fill(spec.limit) }));
      assert.deepEqual(about(atLimit, 'over the limit'), [], `${store} ${field} at the limit`);
      const over = checkListing(listing({ [`${store} ${locale} ${field}`]: fill(spec.limit + 1) }));
      const found = about(over, 'over the limit', STORE_NAME[store], locale, field, unit);
      assert.equal(found.length, 1, `${store} ${field} one over: ${over.join('\n')}`);
    }
  }
});

test('2. keywords count UTF-8 bytes, not characters', () => {
  // 50 characters, 100 bytes: at the limit.
  const fifty = 'é'.repeat(50);
  assert.deepEqual(
    about(checkListing(listing({ 'apple fr-FR Keywords': fifty })), 'over the limit'),
    [],
  );
  // 51 characters, 102 bytes: over, though far under 100 characters.
  const problems = checkListing(listing({ 'apple fr-FR Keywords': `${fifty}é` }));
  assert.equal(about(problems, 'over the limit', '102 bytes').length, 1, problems.join('\n'));
});

test('3. keywords: a space by a comma, a duplicate, the app name, a company, "app", short words', () => {
  const cases = {
    'film, amis': 'space',
    'film ,amis': 'space',
    'film,amis,film': 'twice',
    'soirée film,film': 'twice',
    'film,Flimme': 'repeats the app name',
    'film,netflix': 'company',
    'film,Letterboxd': 'company',
    'film,TMDB': 'company',
    'film,disney': 'company',
    'film,app': 'word "app"',
    'film,divertissement': 'category',
    'film,films': 'plural',
    'film,tv': 'more than two',
    'film,,amis': 'empty',
  };
  for (const [keywords, word] of Object.entries(cases)) {
    const problems = checkListing(listing({ 'apple fr-FR Keywords': keywords }));
    assert.equal(
      about(problems, 'keywords', word).length,
      1,
      `${keywords}: ${problems.join('\n')}`,
    );
  }
});

test('4. "for kids" and "pour enfants", in any case and with any accents, are a problem anywhere', () => {
  const phrases = ['Fun for kids', 'For Children too', 'Idéal pour les enfants', 'POUR ENFANTS'];
  for (const phrase of phrases) {
    for (const key of [
      'apple fr-FR Description',
      'google en-US Short description',
      'apple en-US Subtitle',
    ]) {
      const problems = checkListing(listing({ [key]: phrase }));
      assert.equal(
        about(problems, 'kids').length,
        1,
        `${phrase} in ${key}: ${problems.join('\n')}`,
      );
    }
  }
  // "For the whole family" is fine.
  const family = checkListing(listing({ 'apple en-US Promotional Text': 'For the whole family.' }));
  assert.deepEqual(about(family, 'kids'), []);
});

test("5. another platform's name is a problem in a store's fields", () => {
  for (const word of ['Android', 'Google Play', 'Play Store']) {
    const problems = checkListing(
      listing({ 'apple fr-FR Promotional Text': `Aussi sur ${word}.` }),
    );
    assert.equal(about(problems, 'platform', word).length, 1, `${word}: ${problems.join('\n')}`);
  }
  for (const word of ['iPhone', 'iOS', 'App Store', 'iPad']) {
    const problems = checkListing(
      listing({ 'google en-US Short description': `Also on ${word}.` }),
    );
    assert.equal(about(problems, 'platform', word).length, 1, `${word}: ${problems.join('\n')}`);
  }
  // Each store's own platform is fine.
  assert.deepEqual(
    checkListing(listing({ 'apple en-US Promotional Text': 'Made for iPhone.' })).filter((p) =>
      p.includes('platform'),
    ),
    [],
  );
});

test('6. a full description without the TMDB notice or the JustWatch credit in its language', () => {
  const { tmdb, justwatch } = CREDITS.fr;
  const cases = [
    ['apple fr-FR Description', `Texte.\n\n${justwatch}`, 'TMDB'],
    ['google fr-FR Full description', `Texte.\n\n${tmdb}`, 'JustWatch'],
    // The English credits in a French description are not the French credits.
    ['apple fr-FR Description', `Texte.\n\n${CREDITS.en.tmdb}\n${CREDITS.en.justwatch}`, 'TMDB'],
    ['google en-US Full description', `Text.\n\n${CREDITS.en.tmdb}`, 'JustWatch'],
  ];
  for (const [key, value, credit] of cases) {
    const problems = checkListing(listing({ [key]: value }));
    assert.equal(about(problems, 'credit', credit).length, 1, `${key}: ${problems.join('\n')}`);
  }
  // The credits are the app's own strings.
  const app = (l, file) =>
    JSON.parse(
      readFileSync(new URL(`../mobile/src/i18n/locales/${l}/${file}.json`, import.meta.url)),
    );
  for (const l of ['en', 'fr']) {
    assert.equal(CREDITS[l].tmdb, app(l, 'settings').about.tmdb);
    assert.equal(CREDITS[l].justwatch, app(l, 'common').card.justwatch);
  }
});

test('7. features the first release lacks are a problem in any field', () => {
  const claims = [
    'Import your Letterboxd history',
    'Sign in with Apple',
    'Get a notification when it starts',
    'Reçois une notification',
    'A deck that learns what you like',
    'Des propositions qui apprennent tes goûts',
    'No swipe limit',
    'Swipes illimités',
    'Pick a mood',
    'Choisis ton humeur',
    'Date Night mode',
  ];
  for (const claim of claims) {
    const problems = checkListing(
      listing({
        'google fr-FR Full description': `${claim}.\n\n${CREDITS.fr.tmdb}\n${CREDITS.fr.justwatch}`,
      }),
    );
    assert.equal(about(problems, 'first release').length, 1, `${claim}: ${problems.join('\n')}`);
  }
});

test('7b. no streaming service is named in any field (Q1.4)', () => {
  for (const name of ['Netflix', 'Disney+', 'Prime Video', 'Canal+', 'Apple TV']) {
    const problems = checkListing(listing({ 'apple fr-FR Promotional Text': `Sur ${name}.` }));
    assert.equal(about(problems, 'service').length, 1, `${name}: ${problems.join('\n')}`);
  }
});

test('8. dashes, emoji in short fields, price and ranking words in names', () => {
  for (const dash of ['\u2014', '\u2013']) {
    const problems = checkListing(
      listing({ 'apple en-US Promotional Text': `Swipe ${dash} match.` }),
    );
    assert.equal(about(problems, 'dash').length, 1, problems.join('\n'));
  }
  for (const key of [
    'apple fr-FR Subtitle',
    'google en-US Short description',
    'google fr-FR App name',
  ]) {
    const problems = checkListing(listing({ [key]: 'Movie night 🍿' }));
    assert.equal(about(problems, 'emoji').length, 1, `${key}: ${problems.join('\n')}`);
  }
  // Emoji are allowed in a full description.
  const desc = `Movie night 🍿\n\n${CREDITS.en.tmdb}\n${CREDITS.en.justwatch}`;
  assert.deepEqual(
    about(checkListing(listing({ 'google en-US Full description': desc })), 'emoji'),
    [],
  );
  for (const word of ['Free', 'gratuit', 'Best', '#1', 'Top', 'New', 'Meilleur']) {
    for (const key of [
      'apple fr-FR Name',
      'google en-US App name',
      'apple en-US Subtitle',
      'google fr-FR Short description',
    ]) {
      const problems = checkListing(listing({ [key]: `Flimme ${word}` }));
      assert.equal(
        about(problems, 'price or ranking').length,
        1,
        `${word} in ${key}: ${problems.join('\n')}`,
      );
    }
  }
  // "Free" is fine in a description.
  const free = `Free.\n\n${CREDITS.en.tmdb}\n${CREDITS.en.justwatch}`;
  assert.deepEqual(
    about(checkListing(listing({ 'apple en-US Description': free })), 'price or ranking'),
    [],
  );
  // No exclamation mark: the copy keeps them for celebrations, and a listing has none.
  const bang = checkListing(listing({ 'apple en-US Promotional Text': 'Swipe now!' }));
  assert.equal(about(bang, 'exclamation').length, 1, bang.join('\n'));
});

test('8b. the name is Flimme alone (Q1.2), and en-GB is en-US but for its keywords (Q1.3)', () => {
  const named = checkListing(listing({ 'apple fr-FR Name': 'Flimme: soirée film' }));
  assert.equal(about(named, 'name', 'flimme').length, 1, named.join('\n'));
  const drift = checkListing(listing({ 'apple en-GB Subtitle': 'Pick a film together' }));
  assert.equal(about(drift, 'en-GB', 'en-US', 'Subtitle').length, 1, drift.join('\n'));
});

test('9. a missing locale or field, an unknown field, or a heading without exactly one block', () => {
  const missingField = checkListing(listing({ 'google en-US Short description': undefined }));
  assert.equal(
    about(missingField, 'missing', 'Google Play Console', 'en-US', 'Short description').length,
    1,
  );

  const noGb = listing().filter((e) => !(e.store === 'apple' && e.locale === 'en-GB'));
  const missingLocale = checkListing(noGb);
  for (const field of REQUIRED.apple['en-GB']) {
    assert.equal(
      about(missingLocale, 'missing', 'App Store Connect', 'en-GB', field).length,
      1,
      field,
    );
  }

  const twice = checkListing([...listing(), listing().find((e) => e.field === 'Subtitle')]);
  assert.equal(about(twice, 'twice', 'Subtitle').length, 1, twice.join('\n'));

  const unknown = checkListing([
    ...listing(),
    { store: 'apple', locale: 'fr-FR', field: 'Tagline', value: 'x', label: '30', blocks: 1 },
  ]);
  assert.equal(about(unknown, 'unknown field', 'Tagline').length, 1, unknown.join('\n'));

  const wrongLabel = listing();
  wrongLabel.find((e) => e.field === 'Keywords').label = '100';
  assert.equal(about(checkListing(wrongLabel), 'heading', '100 bytes').length, 1);

  // Parsing: two fenced blocks under one heading, and none.
  const md = [
    '# Listing',
    '',
    '## App Store Connect: App Information',
    '',
    '### Name · fr-FR (30)',
    '',
    'Some words for Harry, not pasted.',
    '',
    '```text',
    'Flimme',
    '```',
    '',
    '```text',
    'Flimme again',
    '```',
    '',
    '### Subtitle · fr-FR (30)',
    '',
    '## Google Play Console: Store settings',
    '',
    '### Tags · all (up to 5)',
    '',
    '- Movie',
    '- Entertainment',
    '',
    '## Sources',
    '',
    '### Not an entry · fr-FR (30)',
    '',
    '```text',
    'ignored',
    '```',
  ].join('\n');
  const parsed = parseStoreFile(md);
  assert.deepEqual(
    parsed.map(({ store, locale, field, value, blocks, label }) => ({
      store,
      locale,
      field,
      value,
      blocks,
      label,
    })),
    [
      { store: 'apple', locale: 'fr-FR', field: 'Name', value: 'Flimme', blocks: 2, label: '30' },
      { store: 'apple', locale: 'fr-FR', field: 'Subtitle', value: '', blocks: 0, label: '30' },
      {
        store: 'google',
        locale: 'all',
        field: 'Tags',
        value: 'Movie\nEntertainment',
        blocks: 0,
        label: 'up to 5',
      },
    ],
  );
  const problems = checkListing(parsed);
  assert.equal(about(problems, 'Name', '2 fenced blocks').length, 1, problems.join('\n'));
  assert.equal(about(problems, 'Subtitle', '0 fenced blocks').length, 1, problems.join('\n'));

  // A fenced block keeps its lines exactly, blank lines and all.
  const [desc] = parseStoreFile(
    '## App Store Connect\n### Description · fr-FR (4,000)\n```text\nUn.\n\nDeux.\n```\n',
  );
  assert.equal(desc.value, 'Un.\n\nDeux.');
});

test('9b. tags: at most 5, no repeats', () => {
  const six = checkListing(listing({ 'google all Tags': 'A\nB\nC\nD\nE\nF' }));
  assert.equal(about(six, 'tags', '6').length, 1, six.join('\n'));
  const repeat = checkListing(listing({ 'google all Tags': 'Movie\nMovie' }));
  assert.equal(about(repeat, 'tags', 'twice').length, 1, repeat.join('\n'));
});

test('10. the real docs/store/listing.md passes', () => {
  const entries = parseStoreFile(readFileSync(LISTING_FILE, 'utf8'));
  assert.deepEqual(checkListing(entries), []);
  // Every required value is there, so a renamed heading can't hide a field from the checks.
  const count = Object.values(REQUIRED)
    .flatMap((l) => Object.values(l))
    .flat().length;
  assert.equal(entries.length, count);
});
