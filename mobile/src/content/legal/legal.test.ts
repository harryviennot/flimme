// The legal texts (M8.1, and the terms with M8.2): each language exists, and each text keeps to
// the small Markdown subset the website renders (M8.3): one `#` title, `##` and `###` headings,
// paragraphs, `-` lists, **bold**, https and mailto links, simple pipe tables. No HTML, images,
// footnotes, code, nested or numbered lists.
import privacyEn, { updated as privacyEnUpdated } from './privacy.en';
import privacyFr, { updated as privacyFrUpdated } from './privacy.fr';

type Text = { lang: 'fr' | 'en'; body: string; updated: string };
type Doc = { name: string; texts: Text[] };

const DOCS: Doc[] = [
  {
    name: 'privacy',
    texts: [
      { lang: 'fr', body: privacyFr, updated: privacyFrUpdated },
      { lang: 'en', body: privacyEn, updated: privacyEnUpdated },
    ],
  },
];

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;

/** The problems with one line, or an empty list when it keeps to the subset. */
function lineProblems(line: string, index: number): string[] {
  const problems: string[] = [];
  if (/^\s+\S/.test(line)) problems.push('indented (nested lists and code blocks are out)');
  if (/\s$/.test(line)) problems.push('trailing whitespace');
  if (/^#(?!#)/.test(line) && index !== 0) problems.push('a second # title');
  if (/^#{4,}/.test(line)) problems.push('a heading deeper than ###');
  if (/^#{1,3}(?![# ])/.test(line)) problems.push('a heading without a space');
  if (/^[*+] /.test(line)) problems.push('a list item not made with -');
  if (/^\d+[.)] /.test(line)) problems.push('a numbered list');
  if (/^>/.test(line)) problems.push('a quote');
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) problems.push('a horizontal rule');
  if (line.startsWith('|') !== line.endsWith('|')) problems.push('a table row not closed by |');

  if (line.includes('![')) problems.push('an image');
  for (const [, , url] of line.matchAll(LINK)) {
    if (!/^(https:\/\/|mailto:)\S+$/.test(url))
      problems.push(`a link that is not https or mailto: ${url}`);
  }
  const prose = line.replace(LINK, (_, label: string) => label);
  if (/[[\]]/.test(prose))
    problems.push('a bracket outside a link (image, footnote or broken link)');
  if (/<[a-zA-Z/!]/.test(prose)) problems.push('HTML');
  if (prose.includes('`')) problems.push('code');
  if (prose.includes('_')) problems.push('an underscore (emphasis is out)');
  if ((prose.match(/\*\*/g) ?? []).length % 2 !== 0) problems.push('unbalanced **');
  if (prose.replace(/\*\*/g, '').includes('*')) problems.push('a single * (italics are out)');
  if (/[–—]/.test(line)) problems.push('an em or en dash');
  return problems;
}

/** Consecutive table lines, each table as a list of rows. */
function tables(lines: string[]): string[][] {
  const found: string[][] = [];
  let current: string[] = [];
  for (const line of [...lines, '']) {
    if (line.startsWith('|')) current.push(line);
    else if (current.length) {
      found.push(current);
      current = [];
    }
  }
  return found;
}

const cells = (row: string) => row.slice(1, -1).split('|').length;

/** The date as the text writes it: "5 novembre 2026", "5 November 2026". */
function longDate(iso: string, lang: Text['lang']): string {
  return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));
}

const headings = (body: string) => body.split('\n').filter((line) => /^#{2,3} /.test(line));

describe.each(DOCS)('the $name text', ({ texts }) => {
  it('exists in French and in English', () => {
    expect(texts.map((text) => text.lang).sort()).toEqual(['en', 'fr']);
    for (const text of texts) {
      expect(typeof text.body).toBe('string');
      expect(text.body.trim().length).toBeGreaterThan(500);
    }
  });

  describe.each(texts)('in $lang', (text) => {
    const lines = text.body.split('\n');

    it('starts with its one # title', () => {
      expect(lines[0]).toMatch(/^# \S/);
      expect(lines.filter((line) => /^#(?!#)/.test(line))).toHaveLength(1);
    });

    it('uses only the Markdown subset', () => {
      const problems = lines.flatMap((line, index) =>
        lineProblems(line, index).map((problem) => `line ${index + 1}: ${problem}: ${line}`),
      );
      expect(problems).toEqual([]);
    });

    it('has simple tables: a header, a separator, then rows of the same width', () => {
      const found = tables(lines);
      expect(found.length).toBeGreaterThan(0);
      for (const table of found) {
        expect(table.length).toBeGreaterThanOrEqual(3);
        expect(table[1]).toMatch(/^\|( *:?-{3,}:? *\|)+$/);
        const width = cells(table[0]);
        for (const row of table) expect(cells(row)).toBe(width);
      }
    });

    it('names the support address and the CNIL', () => {
      expect(text.body).toContain('[support@flimme.com](mailto:support@flimme.com)');
      expect(text.body).toContain('CNIL');
    });

    it('carries its date, in the text and in `updated`', () => {
      expect(text.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(text.updated))).toBe(false);
      expect(text.body).toContain(longDate(text.updated, text.lang));
    });
  });

  it('has the same sections and date in both languages', () => {
    const [first, ...others] = texts;
    for (const other of others) {
      expect(other.updated).toBe(first.updated);
      expect(headings(other.body).map((line) => line.match(/^#+/)?.[0])).toEqual(
        headings(first.body).map((line) => line.match(/^#+/)?.[0]),
      );
    }
  });
});

describe('the subset check', () => {
  it.each([
    ['<b>bold</b>', 'HTML'],
    ['![poster](https://example.com/a.png)', 'an image'],
    ['a footnote[^1]', 'a bracket outside a link'],
    ['  - nested', 'indented'],
    ['1. first', 'a numbered list'],
    ['* item', 'a list item not made with -'],
    ['#### deep', 'a heading deeper than ###'],
    ['a [link](http://example.com)', 'a link that is not https or mailto'],
    ['*italic*', 'a single *'],
    ['use `code`', 'code'],
    ['one — two', 'an em or en dash'],
    ['| open row', 'a table row not closed by |'],
  ])('refuses %s', (line, problem) => {
    expect(lineProblems(line, 3).join(' ')).toContain(problem);
  });

  it('accepts a line of the subset', () => {
    expect(
      lineProblems(
        'Write to **[support](mailto:support@flimme.com)** or see [this](https://flimme.com).',
        3,
      ),
    ).toEqual([]);
  });
});
