#!/usr/bin/env node
// Checks the store copy Harry pastes into App Store Connect and Google Play Console (roadmap
// M11.1) against the stores' limits and rules: lengths (keywords in UTF-8 bytes), the keyword
// field's shape, no "for kids", no other platform, the TMDB and JustWatch credits, nothing the
// first release lacks, no streaming service named, no dashes.
//
//   node tools/store-copy.mjs                 checks docs/store/listing.md
//   node tools/store-copy.mjs <file.md>       checks another answer file in the same format
//
// The format (docs/store/listing.md): a "## " heading starting with "App Store Connect" or
// "Google Play Console" opens that store's values (the rest of the heading names the console
// page); any other "## " heading closes them. Under it, each value is a
// "### <Field> · <locale> (<limit>)" heading followed by exactly one fenced block holding the
// value and nothing else; prose around the block is allowed. A field marked `list` (Play's tags)
// takes "- " list items instead of a block. Exits 1 naming the store, locale and field of every
// problem. M11.8 adds the review notes' fields and rules to the tables below.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const LISTING_FILE = new URL('../docs/store/listing.md', import.meta.url);

const STORE_NAMES = { apple: 'App Store Connect', google: 'Google Play Console' };

// Sources, checked on 5 and 6 November 2026.
const SRC = {
  appleAppInfo:
    'https://developer.apple.com/help/app-store-connect/reference/app-information/app-information',
  appleVersion:
    'https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information',
  appleGuidelines: 'https://developer.apple.com/app-store/review/guidelines/',
  appleProductPage: 'https://developer.apple.com/app-store/product-page/',
  googleListing: 'https://support.google.com/googleplay/android-developer/answer/9859152',
  googleMetadata: 'https://support.google.com/googleplay/android-developer/answer/9898842',
  googleTags: 'https://support.google.com/googleplay/android-developer/answer/9859673',
  tmdb: 'docs/integrations/tmdb.md#terms-licence-and-attribution',
  firstRelease: 'docs/product/roadmap.md#the-first-release-whats-in-what-waits',
  decisions: 'docs/decisions.md',
  copy: '.claude/skills/copy/SKILL.md',
};

// Rules every field of a store gets.
const COMMON = ['dashes', 'exclamation', 'kids', 'platform', 'firstRelease', 'services'];

/** Every field, keyed by store then by the console's field name. `label` is what the heading's
 * parentheses must say; `rules` name entries of RULES. */
export const FIELDS = {
  apple: {
    Name: { limit: 30, label: '30', rules: [...COMMON, 'emoji', 'priceWords', 'appName'], source: SRC.appleAppInfo },
    Subtitle: { limit: 30, label: '30', rules: [...COMMON, 'emoji', 'priceWords'], source: SRC.appleAppInfo },
    'Promotional Text': { limit: 170, label: '170', rules: COMMON, source: SRC.appleVersion },
    Description: { limit: 4000, label: '4,000', rules: [...COMMON, 'credits'], source: SRC.appleVersion },
    Keywords: {
      limit: 100,
      unit: 'bytes',
      label: '100 bytes',
      rules: [...COMMON, 'emoji', 'priceWords', 'keywords'],
      source: SRC.appleVersion,
    },
  },
  google: {
    'App name': { limit: 30, label: '30', rules: [...COMMON, 'emoji', 'priceWords', 'appName'], source: SRC.googleListing },
    'Short description': { limit: 80, label: '80', rules: [...COMMON, 'emoji', 'priceWords'], source: SRC.googleListing },
    'Full description': { limit: 4000, label: '4,000', rules: [...COMMON, 'credits'], source: SRC.googleListing },
    Tags: { list: true, max: 5, label: 'up to 5', rules: ['tags'], source: SRC.googleTags },
  },
};

const APPLE_FIELDS = ['Name', 'Subtitle', 'Promotional Text', 'Description', 'Keywords'];
const GOOGLE_FIELDS = ['App name', 'Short description', 'Full description'];

/** The values listing.md must hold: Apple fr-FR (primary), en-US and en-GB; Google fr-FR
 * (default) and en-US; Play's tags once (Q1.3, decisions.md). */
export const REQUIRED = {
  apple: { 'fr-FR': APPLE_FIELDS, 'en-US': APPLE_FIELDS, 'en-GB': APPLE_FIELDS },
  google: { 'fr-FR': GOOGLE_FIELDS, 'en-US': GOOGLE_FIELDS, all: ['Tags'] },
};

// The credits are the app's own strings (Settings > About and the card back), so the listing
// says exactly what the app says (tmdb.md#terms-licence-and-attribution).
const appStrings = (lang, file) =>
  JSON.parse(
    readFileSync(new URL(`../mobile/src/i18n/locales/${lang}/${file}.json`, import.meta.url), 'utf8'),
  );
export const CREDITS = Object.fromEntries(
  ['en', 'fr'].map((lang) => [
    lang,
    { tmdb: appStrings(lang, 'settings').about.tmdb, justwatch: appStrings(lang, 'common').card.justwatch },
  ]),
);

/** Lower case, accents and other marks removed, so "Pour les Enfants" and "pour les enfants"
 * read the same. */
const fold = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** [display name, pattern on folded text]; the first that matches is reported. */
const KIDS = [
  ['for kids', /\bfor (?:the |your )?kids\b/],
  ['for children', /\bfor (?:the |your )?children\b/],
  ['pour les enfants', /\bpour (?:les |tes |vos |des )?enfants\b/],
];
const OTHER_PLATFORM = {
  apple: [
    ['Android', /\bandroid\b/],
    ['Google Play', /\bgoogle play\b/],
    ['Play Store', /\bplay store\b/],
  ],
  google: [
    ['iPhone', /\biphone\b/],
    ['iPad', /\bipad\b/],
    ['iOS', /\bios\b/],
    ['App Store', /\bapp store\b/],
    ['Apple', /\bapple\b/],
  ],
};
// What the first release doesn't have (roadmap.md#the-first-release-whats-in-what-waits;
// decisions.md, "the first release stays without accounts" and the solo cap of 100 cards a day).
const NOT_IN_FIRST_RELEASE = [
  ['Letterboxd', /\bletterboxd\b/],
  ['sign-in', /\bsign in with\b|\bse connecter avec\b|\bconnexion avec (?:apple|google)\b/],
  ['notifications', /\bnotification/],
  ['a deck that learns', /\blearns?\b|\blearning\b|\bapprend|\bapprenn/],
  ['moods', /\bmoods?\b|\bhumeurs?\b/],
  ['no swipe limit', /\bunlimited\b|\bno swipe limit\b|\bno limit\b|\billimite|\bsans limite\b/],
  ['other modes', /\bdate night\b|\bparty mode\b|\bblind mode\b|\bmode (?:soiree|blind|party)\b/],
];
// No streaming service named anywhere (Q1.4).
const SERVICES = [
  ['Netflix', /\bnetflix\b/],
  ['Prime Video', /\bprime video\b|\bamazon\b/],
  ['Disney+', /\bdisney\b/],
  ['Canal+', /\bcanal ?(?:\+|plus\b)/],
  ['Apple TV', /\bapple tv\b/],
  ['HBO Max', /\bhbo\b/],
  ['Paramount+', /\bparamount\b/],
  ['OCS', /\bocs\b/],
  ['Molotov', /\bmolotov\b/],
  ['YouTube', /\byoutube\b/],
  ['Crunchyroll', /\bcrunchyroll\b/],
  ['MUBI', /\bmubi\b/],
  ['Rakuten TV', /\brakuten\b/],
  ['Pluto TV', /\bpluto tv\b/],
  ['france.tv', /\bfrance\.tv\b/],
];
// Other companies and apps, never in Apple's keywords (2.3.7; the product page guide).
const COMPANIES = [
  'letterboxd', 'tmdb', 'justwatch', 'imdb', 'netflix', 'disney', 'prime', 'amazon', 'canal',
  'apple', 'google', 'hbo', 'paramount', 'ocs', 'molotov', 'youtube', 'mubi', 'rakuten',
  'allocine', 'senscritique', 'trakt', 'plex', 'tinder', 'rotten',
];
// Price, promotion and ranking words: never in a name (Apple 2.3.7, Google's metadata policy),
// and kept out of the subtitle, keywords and short description too.
const PRICE_WORDS = [
  /\bfree\b/, /\bgratuit/, /\bbest\b/, /\bmeilleur/, /#\s?1\b/, /\btop\b/, /\bnew\b/, /\bnouveau\b/,
  /\bnouvelle\b/, /\bpopular\b/, /\bpopulaire\b/, /\bapp of the year\b/, /\bpromo/, /% off\b/,
];
const CATEGORY_WORDS = ['entertainment', 'divertissement', 'lifestyle', 'style de vie'];
const APP_WORDS = ['app', 'apps', 'application', 'appli'];

const firstMatch = (list, text) => list.find(([, re]) => re.test(fold(text)))?.[0];

/** Each rule: (entry, spec) => problem messages, with the source that states it. */
export const RULES = {
  dashes: {
    source: 'CLAUDE.md#writing',
    check: ({ value }) => (/[\u2013\u2014]/.test(value) ? ['has an em or en dash: use a comma, a colon or parentheses'] : []),
  },
  exclamation: {
    source: SRC.copy,
    check: ({ value }) => (value.includes('!') ? ['has an exclamation mark: the copy keeps them for celebrations'] : []),
  },
  kids: {
    source: `${SRC.appleGuidelines} (2.3.8)`,
    check: ({ value }) => {
      const hit = firstMatch(KIDS, value);
      return hit ? [`says "${hit}": "For Kids" and "For Children" are reserved for the Kids Category (Apple 2.3.8)`] : [];
    },
  },
  platform: {
    source: `${SRC.appleGuidelines} (2.3.10)`,
    check: ({ store, value }) => {
      const hit = firstMatch(OTHER_PLATFORM[store], value);
      return hit ? [`names another platform (${hit}): no other store's platform in a listing (Apple 2.3.10, and the reverse)`] : [];
    },
  },
  firstRelease: {
    source: SRC.firstRelease,
    check: ({ value }) =>
      NOT_IN_FIRST_RELEASE.filter(([, re]) => re.test(fold(value))).map(
        ([name]) => `promises ${name}, which the first release doesn't have`,
      ),
  },
  services: {
    source: `${SRC.decisions} (M11.1 Q1.4)`,
    check: ({ value }) => {
      const hit = firstMatch(SERVICES, value);
      return hit ? [`names a streaming service (${hit}): the copy says "your services" instead (Q1.4)`] : [];
    },
  },
  emoji: {
    source: SRC.googleMetadata,
    check: ({ value }) => (/\p{Extended_Pictographic}/u.test(value) ? ['has an emoji'] : []),
  },
  priceWords: {
    source: `${SRC.appleGuidelines} (2.3.7); ${SRC.googleMetadata}`,
    check: ({ value }) => {
      const hits = PRICE_WORDS.filter((re) => re.test(fold(value)));
      return hits.length ? [`has a price or ranking word (${hits.map((re) => fold(value).match(re)[0]).join(', ')})`] : [];
    },
  },
  appName: {
    source: `${SRC.decisions} (M11.1 Q1.2)`,
    check: ({ value }) => (value === 'Flimme' ? [] : [`the name is "Flimme" alone (Q1.2), not "${value}"`]),
  },
  credits: {
    source: SRC.tmdb,
    check: ({ locale, value }) => {
      const credits = CREDITS[locale.slice(0, 2)];
      if (!credits) return [`no credits known for ${locale}`];
      const problems = [];
      if (!value.includes(credits.tmdb)) problems.push(`missing the TMDB credit, "${credits.tmdb}"`);
      if (!value.includes(credits.justwatch)) problems.push(`missing the JustWatch credit, "${credits.justwatch}"`);
      return problems;
    },
  },
  keywords: {
    source: `${SRC.appleProductPage}; ${SRC.appleVersion}`,
    check: ({ value }) => keywordProblems(value).map((p) => `keywords: ${p}`),
  },
  tags: {
    source: SRC.googleTags,
    check: ({ value }, spec) => {
      const tags = value.split('\n').map((t) => t.trim()).filter(Boolean);
      const problems = [];
      if (!tags.length) problems.push('tags: none listed');
      if (tags.length > spec.max) problems.push(`tags: ${tags.length} listed, Google allows up to ${spec.max}`);
      const seen = new Set();
      for (const tag of tags) {
        if (seen.has(fold(tag))) problems.push(`tags: "${tag}" appears twice`);
        seen.add(fold(tag));
      }
      return problems;
    },
  },
};

/** Apple's keyword field: terms separated by commas and no spaces, each more than two
 * characters; no word twice, no plural of a word already there, not the app's name, no other
 * company or app, not the word "app", no category names (the product page guide and the
 * version information reference). */
function keywordProblems(value) {
  const problems = [];
  if (/\s,|,\s/.test(value)) problems.push('a space next to a comma wastes a byte: separate with commas only');
  const terms = value.split(',').map((t) => t.trim());
  if (terms.some((t) => !t)) problems.push('an empty keyword (two commas in a row, or one at an end)');
  for (const term of terms.filter(Boolean)) {
    if ([...term].length <= 2) problems.push(`"${term}" must be more than two characters`);
  }
  const words = terms.flatMap((t) => fold(t).split(/\s+/)).filter(Boolean);
  const counted = new Map();
  for (const w of words) counted.set(w, (counted.get(w) ?? 0) + 1);
  for (const [w, n] of counted) {
    if (n > 1) problems.push(`"${w}" appears twice: Apple combines the words itself`);
    if (w === 'flimme') problems.push('repeats the app name, which Apple already searches');
    if (COMPANIES.includes(w)) problems.push(`"${w}" is another company's or app's name`);
    if (APP_WORDS.includes(w)) problems.push(`"${w}": Apple asks to leave out the word "app"`);
    for (const end of ['s', 'x']) {
      if (w.endsWith(end) && counted.has(w.slice(0, -1))) problems.push(`"${w}" is the plural of "${w.slice(0, -1)}"`);
    }
  }
  const folded = fold(value);
  for (const c of CATEGORY_WORDS) {
    if (new RegExp(`(?:^|,|\\s)${c}(?:$|,|\\s)`).test(folded)) problems.push(`"${c}" is a category name, already searched`);
  }
  return problems;
}

/** The values of a store answer file, in order: { store, locale, field, value, label, blocks }.
 * `value` is the first fenced block's text exactly (or the list items, one per line), `blocks`
 * the number of fenced blocks under the heading. */
export function parseStoreFile(markdown) {
  const entries = [];
  let store = null;
  let entry = null;
  let fence = null;
  for (const line of markdown.split('\n')) {
    if (fence) {
      if (line.startsWith('```')) {
        if (entry) {
          entry.blocks += 1;
          if (entry.blocks === 1) entry.value = fence.join('\n');
        }
        fence = null;
      } else fence.push(line);
      continue;
    }
    if (line.startsWith('```')) {
      fence = [];
      continue;
    }
    const h2 = line.match(/^#{1,2} (.+)$/);
    if (h2) {
      store = Object.keys(STORE_NAMES).find((s) => line.startsWith(`## ${STORE_NAMES[s]}`)) ?? null;
      entry = null;
      continue;
    }
    if (line.startsWith('### ')) {
      const m = store && line.match(/^### (.+?) · (\S+) \((.+)\)\s*$/);
      entry = m ? { store, locale: m[2], field: m[1], value: '', label: m[3], blocks: 0, items: [] } : null;
      if (entry) entries.push(entry);
      continue;
    }
    if (line.startsWith('#')) {
      entry = null;
      continue;
    }
    const item = entry && line.match(/^- (.+)$/);
    if (item) entry.items.push(item[1].trim());
  }
  for (const e of entries) {
    if (!e.blocks && e.items.length) e.value = e.items.join('\n');
    delete e.items;
  }
  return entries;
}

/** Every problem with the entries, as "<store> · <locale> · <field>: <problem>"; empty when fine. */
export function checkListing(entries, required = REQUIRED) {
  const problems = [];
  const at = (e) => `${STORE_NAMES[e.store] ?? e.store} · ${e.locale} · ${e.field}`;
  const seen = new Map();

  for (const e of entries) {
    const spec = FIELDS[e.store]?.[e.field];
    if (!spec) {
      problems.push(`${at(e)}: unknown field (the console's fields are in tools/store-copy.mjs)`);
      continue;
    }
    const key = `${e.store} ${e.locale} ${e.field}`;
    if (seen.has(key)) {
      problems.push(`${at(e)}: appears twice`);
      continue;
    }
    seen.set(key, e);
    if (e.label !== spec.label) problems.push(`${at(e)}: the heading says (${e.label}), the limit is (${spec.label})`);
    if (spec.list) {
      if (e.blocks) problems.push(`${at(e)}: a list of "- " items, not a fenced block`);
    } else if (e.blocks !== 1) {
      problems.push(`${at(e)}: ${e.blocks} fenced blocks under its heading, expected 1`);
    }
    if (spec.limit) {
      const size = spec.unit === 'bytes' ? Buffer.byteLength(e.value, 'utf8') : [...e.value].length;
      const unit = spec.unit === 'bytes' ? 'bytes' : 'characters';
      if (size > spec.limit) problems.push(`${at(e)}: ${size} ${unit}, over the limit of ${spec.limit} ${unit}`);
    }
    for (const rule of spec.rules) {
      for (const p of RULES[rule].check(e, spec)) problems.push(`${at(e)}: ${p}`);
    }
  }

  for (const [store, locales] of Object.entries(required)) {
    for (const [locale, fields] of Object.entries(locales)) {
      for (const field of fields) {
        if (!seen.has(`${store} ${locale} ${field}`)) problems.push(`${at({ store, locale, field })}: missing`);
      }
    }
  }

  // One English text on Apple: en-GB is en-US but for its keywords (Q1.3).
  for (const field of APPLE_FIELDS.filter((f) => f !== 'Keywords')) {
    const us = seen.get(`apple en-US ${field}`);
    const gb = seen.get(`apple en-GB ${field}`);
    if (us && gb && us.value !== gb.value) {
      problems.push(`${at(gb)}: differs from en-US; Apple's English is one text, only the keywords differ (Q1.3)`);
    }
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const file = process.argv[2] ?? LISTING_FILE;
  const entries = parseStoreFile(readFileSync(file, 'utf8'));
  const problems = checkListing(entries);
  if (problems.length) {
    console.error(problems.join('\n'));
    console.error(`\n${problems.length} problem${problems.length === 1 ? '' : 's'} in ${file}`);
    process.exit(1);
  }
  console.log(`ok: ${entries.length} values checked`);
}
