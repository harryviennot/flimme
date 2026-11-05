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
// Built from code points: the repository keeps the characters themselves out of every file.
const EN_DASH = String.fromCharCode(0x2013);
const EM_DASH = String.fromCharCode(0x2014);

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
  for (const [, , url = ''] of line.matchAll(LINK)) {
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
  if (line.includes(EN_DASH) || line.includes(EM_DASH)) problems.push('an em or en dash');
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

/** The problems with one table: a header, a separator, then rows as wide as the header. */
function tableProblems(table: string[]): string[] {
  const [header = '', separator = '', ...rows] = table;
  const problems: string[] = [];
  if (!rows.length) problems.push('no row under the header');
  if (!/^\|( *:?-{3,}:? *\|)+$/.test(separator)) problems.push('no separator under the header');
  const width = cells(header);
  if ([separator, ...rows].some((row) => cells(row) !== width))
    problems.push('rows of different widths');
  return problems;
}

/** The date as the text writes it: "5 novembre 2026", "5 November 2026". */
function longDate(iso: string, lang: Text['lang']): string {
  return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));
}

/** Each heading's level and number ("## 4.", "###"): the same list in every language. */
const outline = (body: string) =>
  body
    .split('\n')
    .filter((line) => /^#{2,3} /.test(line))
    .map((line) => line.match(/^#{2,3} (\d+\.)?/)?.[0].trim());

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
      expect(found.flatMap(tableProblems)).toEqual([]);
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
    if (!first) throw new Error('no text');
    for (const other of others) {
      expect(other.updated).toBe(first.updated);
      expect(outline(other.body)).toEqual(outline(first.body));
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
    [`one ${EM_DASH} two`, 'an em or en dash'],
    [`one ${EN_DASH} two`, 'an em or en dash'],
    ['# Another title', 'a second # title'],
    ['##Heading', 'a heading without a space'],
    ['> quoted', 'a quote'],
    ['---', 'a horizontal rule'],
    ['a line ', 'trailing whitespace'],
    ['**open bold', 'unbalanced **'],
    ['some _emphasis_', 'an underscore'],
    ['| open row', 'a table row not closed by |'],
  ])('refuses %s', (line, problem) => {
    expect(lineProblems(line, 3).join(' ')).toContain(problem);
  });

  it.each([
    [['| a | b |', '| --- | --- |'], 'no row under the header'],
    [['| a | b |', '| a | b |', '| c | d |'], 'no separator under the header'],
    [['| a | b |', '| --- | --- |', '| c |'], 'rows of different widths'],
  ])('refuses the table %j', (table, problem) => {
    expect(tableProblems(table)).toContain(problem);
  });

  it('accepts a table of the subset', () => {
    expect(tableProblems(['| a | b |', '| --- | --- |', '| c | d |'])).toEqual([]);
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
