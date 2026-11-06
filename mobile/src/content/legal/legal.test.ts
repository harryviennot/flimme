// The legal texts are Markdown strings that the app and the web pages (M8.3) render with a
// small renderer, so they keep to a subset: one `#` title, `##` and `###` headings,
// paragraphs, `-` bullets (not nested), **bold**, https and mailto links, simple pipe tables.
// Each text joins `documents` below; a text written in both languages also joins `pairs`.
// The terms: M8.2, docs/product/privacy.md#terms-of-use-outline. The privacy policy: M8.1,
// docs/product/privacy.md#privacy-policy-outline.
import deletionEn, { updated as deletionEnUpdated } from './delete-account.en';
import deletionFr, { updated as deletionFrUpdated } from './delete-account.fr';
import privacyEn, { updated as privacyEnUpdated } from './privacy.en';
import privacyFr, { updated as privacyFrUpdated } from './privacy.fr';
import supportEn, { updated as supportEnUpdated } from './support.en';
import supportFr, { updated as supportFrUpdated } from './support.fr';
import termsEn, { updated as termsEnUpdated } from './terms.en';
import termsFr, { updated as termsFrUpdated } from './terms.fr';
import { resolveLegalPath } from '@/features/legal/pages';

type LegalDocument = {
  name: string;
  markdown: string;
  updated: string;
  // Links the text must carry, such as the other legal page in the same language.
  mustLink: string[];
  // Words the text must contain, such as the authority a player can complain to.
  mustSay?: string[];
  // A text that states its own date writes `updated` out in this language ("5 novembre 2026").
  datedIn?: 'fr-FR' | 'en-GB';
};

const documents: LegalDocument[] = [
  {
    name: 'terms.fr',
    markdown: termsFr,
    updated: termsFrUpdated,
    mustLink: ['https://flimme.com/fr/confidentialite'],
  },
  {
    name: 'terms.en',
    markdown: termsEn,
    updated: termsEnUpdated,
    mustLink: ['https://flimme.com/en/privacy'],
  },
  {
    name: 'privacy.fr',
    markdown: privacyFr,
    updated: privacyFrUpdated,
    mustLink: ['https://flimme.com/fr/conditions', 'https://flimme.com/fr/suppression'],
    // The sign-in log is Supabase Auth's audit log; M8.14 keeps this promise.
    mustSay: ['CNIL', '| Journal des connexions | 90 jours au plus'],
    datedIn: 'fr-FR',
  },
  {
    name: 'privacy.en',
    markdown: privacyEn,
    updated: privacyEnUpdated,
    mustLink: ['https://flimme.com/en/terms', 'https://flimme.com/en/delete-account'],
    mustSay: ['CNIL', '| Sign-in log | 90 days at most'],
    datedIn: 'en-GB',
  },
  // M8.3: the support page and the deletion request page, hosted next to the policy and terms.
  {
    name: 'support.fr',
    markdown: supportFr,
    updated: supportFrUpdated,
    mustLink: [
      'https://flimme.com/fr/confidentialite',
      'https://flimme.com/fr/conditions',
      'https://flimme.com/fr/suppression',
    ],
  },
  {
    name: 'support.en',
    markdown: supportEn,
    updated: supportEnUpdated,
    mustLink: [
      'https://flimme.com/en/privacy',
      'https://flimme.com/en/terms',
      'https://flimme.com/en/delete-account',
    ],
  },
  {
    name: 'delete-account.fr',
    markdown: deletionFr,
    updated: deletionFrUpdated,
    mustLink: ['https://flimme.com/fr/confidentialite'],
    // Honest about a guest without the app: the 90 days, the one month, the CNIL.
    mustSay: ['90 jours', 'un mois', 'CNIL', 'mailto:support@flimme.com?subject='],
  },
  {
    name: 'delete-account.en',
    markdown: deletionEn,
    updated: deletionEnUpdated,
    mustLink: ['https://flimme.com/en/privacy'],
    mustSay: ['90 days', 'one month', 'CNIL', 'mailto:support@flimme.com?subject='],
  },
];

// French and English say the same thing, so they share the date and the outline.
const pairs: [string, string][] = [
  ['terms.fr', 'terms.en'],
  ['privacy.fr', 'privacy.en'],
  ['support.fr', 'support.en'],
  ['delete-account.fr', 'delete-account.en'],
];

const SUPPORT_EMAIL = 'support@flimme.com';
const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;
// Figure, en and em dashes and the horizontal bar, by code point so this file has none.
const DASHES = new RegExp(`[${String.fromCodePoint(0x2012, 0x2013, 0x2014, 0x2015)}]`);
const TABLE_SEPARATOR = /^\|(\s*:?-{3,}:?\s*\|)+$/;

const byName = (name: string) => {
  const found = documents.find((d) => d.name === name);
  if (!found) throw new Error(`No legal document named ${name}`);
  return found;
};

const cells = (row: string) => row.slice(1, -1).split('|').length;

// Every way a text leaves the subset, one message per problem, with its line number.
function subsetProblems(markdown: string): string[] {
  const problems: string[] = [];
  const lines = markdown.trimStart().split('\n');
  if (!/^# \S/.test(lines[0] ?? '')) problems.push('line 1: the text must open with a # title');

  let table: string[] = [];
  const closeTable = (end: number) => {
    if (table.length === 0) return;
    const start = end - table.length + 1;
    const [header = '', separator = ''] = table;
    if (!TABLE_SEPARATOR.test(separator))
      problems.push(`line ${start}: a table needs a separator row under its header`);
    if (table.some((row) => cells(row) !== cells(header)))
      problems.push(`line ${start}: every row of a table needs the same number of cells`);
    table = [];
  };

  lines.forEach((line, index) => {
    const n = index + 1;
    if (/^\|.*\|$/.test(line)) {
      table.push(line);
      return;
    }
    closeTable(n - 1);
    if (line.trim() === '') return;
    if (/^\s/.test(line)) problems.push(`line ${n}: indented lines (nested lists, code) are out`);
    else if (/^# /.test(line) && index > 0) problems.push(`line ${n}: only one # title`);
    else if (/^#/.test(line) && !/^#{1,3} \S/.test(line))
      problems.push(`line ${n}: headings are #, ## or ### followed by a space`);
    else if (/^\d+[.)]\s/.test(line)) problems.push(`line ${n}: numbered lists are out`);
    else if (/^[*+]\s/.test(line)) problems.push(`line ${n}: bullets start with "- "`);
    else if (/^-(?! \S)/.test(line)) problems.push(`line ${n}: bullets are "- " then text`);
    else if (/^>/.test(line)) problems.push(`line ${n}: quotes are out`);
    else if (/^(=+|_{3,}|\*{3,})\s*$/.test(line)) problems.push(`line ${n}: rules are out`);
  });
  closeTable(lines.length);

  const linkCount = [...markdown.matchAll(LINK)].length;
  if ((markdown.match(/\]\(/g) ?? []).length !== linkCount)
    problems.push('a link is malformed: use [text](https://...)');
  for (const [, , url = ''] of markdown.matchAll(LINK)) {
    if (!/^(https:\/\/|mailto:)\S+$/.test(url)) problems.push(`link ${url}: https or mailto only`);
  }

  const withoutUrls = markdown.replace(LINK, '[$1]');
  if (/<[A-Za-z!/]/.test(markdown)) problems.push('HTML is out');
  if (markdown.includes('![')) problems.push('images are out');
  if (markdown.includes('[^')) problems.push('footnotes are out');
  if (markdown.includes('`')) problems.push('code is out');
  if (markdown.includes('\\')) problems.push('escapes are out');
  if (withoutUrls.replace(/\*\*[^*\n]+?\*\*/g, '').includes('*'))
    problems.push('emphasis is **bold** only');
  if (withoutUrls.includes('_')) problems.push('emphasis with _ is out');
  return problems;
}

describe('the subset check', () => {
  const title = '# Title\n\n';

  it('passes a text that keeps to the subset', () => {
    const markdown = `${title}## Part\n\n### Detail\n\nA **bold** [link](https://flimme.com) and [mail](mailto:${SUPPORT_EMAIL}).\n\n- One\n- Two\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n`;
    expect(subsetProblems(markdown)).toEqual([]);
  });

  it.each([
    ['no title', '## Part\n'],
    ['a second title', `${title}# Again\n`],
    ['a fourth level heading', `${title}#### Deep\n`],
    ['a nested list', `${title}- One\n  - Two\n`],
    ['a numbered list', `${title}1. One\n`],
    ['a star bullet', `${title}* One\n`],
    ['a quote', `${title}> Said\n`],
    ['HTML', `${title}<b>bold</b>\n`],
    ['an image', `${title}![poster](https://flimme.com/a.png)\n`],
    ['a footnote', `${title}Text[^1]\n`],
    ['code', `${title}Use \`code\`\n`],
    ['an http link', `${title}[link](http://flimme.com)\n`],
    ['a relative link', `${title}[link](/terms)\n`],
    ['italics with a star', `${title}Some *italics*\n`],
    ['italics with an underscore', `${title}Some _italics_\n`],
    ['a table without a separator', `${title}| A | B |\n| 1 | 2 |\n`],
    ['a ragged table', `${title}| A | B |\n| --- | --- |\n| 1 |\n`],
  ])('catches %s', (_, markdown) => {
    expect(subsetProblems(markdown)).not.toEqual([]);
  });

  it('spots an em dash and an en dash', () => {
    expect(DASHES.test(`a ${String.fromCodePoint(0x2014)} b`)).toBe(true);
    expect(DASHES.test(`1${String.fromCodePoint(0x2013)}2`)).toBe(true);
    expect(DASHES.test('a - b')).toBe(false);
  });
});

describe.each(documents)(
  '$name',
  ({ name, markdown, updated, mustLink, mustSay = [], datedIn }) => {
    it('is a Markdown text with a real date', () => {
      expect(markdown.trim().length).toBeGreaterThan(500);
      expect(updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(`${updated}T00:00:00Z`).toISOString().slice(0, 10)).toBe(updated);
    });

    it('opens with its one # title', () => {
      const lines = markdown.trimStart().split('\n');
      expect(lines[0]).toMatch(/^# \S/);
      expect(lines.filter((line) => /^# /.test(line))).toHaveLength(1);
    });

    it('keeps to the Markdown subset', () => {
      expect(subsetProblems(markdown)).toEqual([]);
    });

    it('names the support address, as a mail link', () => {
      expect(markdown).toContain(`[${SUPPORT_EMAIL}](mailto:${SUPPORT_EMAIL})`);
    });

    it('has no em or en dashes', () => {
      expect(markdown).not.toMatch(DASHES);
    });

    it('links the pages it must', () => {
      const urls = [...markdown.matchAll(LINK)].map(([, , url]) => url);
      for (const url of mustLink) expect(urls).toContain(url);
    });

    it('only links flimme.com pages that exist, in its own language', () => {
      const own = name.endsWith('.fr') ? 'fr' : 'en';
      const urls = [...markdown.matchAll(LINK)].map(([, , url]) => url ?? '');
      for (const url of urls.filter((u) => u.startsWith('https://flimme.com/'))) {
        const location = resolveLegalPath(new URL(url).pathname);
        expect(location).not.toBeNull();
        expect(location?.language).toBe(own);
      }
    });

    it('says what it must', () => {
      for (const words of mustSay) expect(markdown).toContain(words);
    });

    it('states the same date as `updated`, when it states one', () => {
      if (!datedIn) return;
      const long = new Intl.DateTimeFormat(datedIn, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(`${updated}T00:00:00Z`));
      expect(markdown).toContain(long);
    });
  },
);

describe.each(pairs)('%s and %s', (first, second) => {
  const a = byName(first);
  const b = byName(second);
  // The heading levels in order, with a section's number when it has one, such as
  // ['##', '## 1.', '### ', '## 2.']: a section dropped or swapped in one language shows.
  const outline = (markdown: string) =>
    markdown
      .split('\n')
      .filter((line) => /^#{2,3} /.test(line))
      .map((line) => line.match(/^#{2,3} (\d+\.)?/)?.[0].trim());

  it('share the same date', () => {
    expect(a.updated).toBe(b.updated);
  });

  it('share the same outline, section by section', () => {
    expect(outline(a.markdown).length).toBeGreaterThan(0);
    expect(outline(a.markdown)).toEqual(outline(b.markdown));
  });

  // How many rows each table has, in order: a line added to a table in one language shows.
  const tables = (markdown: string) => {
    const found: number[] = [];
    let rows = 0;
    for (const line of [...markdown.split('\n'), '']) {
      if (/^\|.*\|$/.test(line)) rows += 1;
      else if (rows > 0) {
        found.push(rows);
        rows = 0;
      }
    }
    return found;
  };

  it('share the same tables, row by row', () => {
    expect(tables(a.markdown)).toEqual(tables(b.markdown));
  });
});

// Section 8 names every processor of docs/product/privacy.md#who-processes-data-for-us, in both
// languages. OVH carries the support mailbox and the website (the record of processing, M8.10).
const PROCESSORS = ['Supabase', 'Fly.io', 'Tigris', 'GitHub', 'Sentry', 'PostHog', 'Expo', 'OVH'];

describe.each(['privacy.fr', 'privacy.en'])('%s', (name) => {
  it.each(PROCESSORS)('names %s as a processor', (processor) => {
    expect(byName(name).markdown).toContain(`\n| ${processor} | `);
  });
});
