// The legal texts are Markdown strings that the app and the web pages (M8.3) render with a
// small renderer, so they keep to a subset: one `#` title, `##` and `###` headings,
// paragraphs, `-` bullets (not nested), **bold**, https and mailto links, simple pipe tables.
// Each text joins `documents` below; a text written in both languages also joins `pairs`.
// The terms: M8.2, docs/product/privacy.md#terms-of-use-outline.
import termsEn, { updated as termsEnUpdated } from './terms.en';
import termsFr, { updated as termsFrUpdated } from './terms.fr';

type LegalDocument = {
  name: string;
  markdown: string;
  updated: string;
  // Links the text must carry, such as the other legal page in the same language.
  mustLink: string[];
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
];

// French and English say the same thing, so they share the date and the outline.
const pairs: [string, string][] = [['terms.fr', 'terms.en']];

const SUPPORT_EMAIL = 'support@flimme.com';
const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;
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
    if (table.length < 2 || !TABLE_SEPARATOR.test(table[1]))
      problems.push(`line ${start}: a table needs a separator row under its header`);
    if (table.some((row) => cells(row) !== cells(table[0])))
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
  for (const [, , url] of markdown.matchAll(LINK)) {
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
});

describe.each(documents)('$name', ({ markdown, updated, mustLink }) => {
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
    expect(markdown).not.toMatch(/[‒–—―]/);
  });

  it('links the pages it must', () => {
    const urls = [...markdown.matchAll(LINK)].map(([, , url]) => url);
    for (const url of mustLink) expect(urls).toContain(url);
  });
});

describe.each(pairs)('%s and %s', (first, second) => {
  const a = byName(first);
  const b = byName(second);
  const headings = (markdown: string, level: string) =>
    markdown.split('\n').filter((line) => line.startsWith(`${level} `)).length;

  it('share the same date', () => {
    expect(a.updated).toBe(b.updated);
  });

  it('share the same outline', () => {
    expect(headings(a.markdown, '##')).toBe(headings(b.markdown, '##'));
    expect(headings(a.markdown, '###')).toBe(headings(b.markdown, '###'));
  });
});
