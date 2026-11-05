// A small Markdown reader for the legal texts (M8.3). It reads only the subset that
// src/content/legal/legal.test.ts enforces: one # title, ## and ### headings, paragraphs, "- "
// bullets, **bold**, [links](https://... or mailto:...) and simple pipe tables. No JSX here.

export type Span = { text: string; bold?: boolean; href?: string };

export type Block =
  | { type: 'title'; spans: Span[] }
  | { type: 'h2'; spans: Span[] }
  | { type: 'h3'; spans: Span[] }
  | { type: 'p'; spans: Span[] }
  | { type: 'list'; items: Span[][] }
  | { type: 'table'; header: Span[][]; rows: Span[][][] };

const INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
const SAFE_HREF = /^(https:\/\/|mailto:)\S+$/;

/** Bold and links in a line of text. A link with an unsafe address stays plain text. */
export function parseInline(text: string): Span[] {
  const spans: Span[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0;
    if (start > last) spans.push({ text: text.slice(last, start) });
    const [whole, bold, label, href] = match;
    if (bold !== undefined) {
      spans.push({ text: bold, bold: true });
    } else if (label !== undefined && href !== undefined && SAFE_HREF.test(href)) {
      spans.push({ text: label, href });
    } else {
      spans.push({ text: whole });
    }
    last = start + whole.length;
  }
  if (last < text.length) spans.push({ text: text.slice(last) });
  return spans;
}

const cellsOf = (row: string): string[] =>
  row
    .trim()
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());

const isTableLine = (line: string) => /^\|.*\|$/.test(line.trim());

/** The blocks of a text, in order. Lines of one paragraph join with a space. */
export function parseMarkdown(markdown: string): Block[] {
  const lines = markdown.split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: Span[][] = [];
  let table: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'p', spans: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ type: 'list', items: list });
    list = [];
  };
  const flushTable = () => {
    if (table.length) {
      const [header = '', , ...rows] = table;
      blocks.push({
        type: 'table',
        header: cellsOf(header).map(parseInline),
        rows: rows.map((row) => cellsOf(row).map(parseInline)),
      });
    }
    table = [];
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushTable();
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === '') {
      flushAll();
      continue;
    }
    if (isTableLine(line)) {
      flushParagraph();
      flushList();
      table.push(line);
      continue;
    }
    const heading = /^(#{1,3}) (\S.*)$/.exec(line);
    if (heading) {
      flushAll();
      const level = heading[1]?.length ?? 1;
      const spans = parseInline(heading[2] ?? '');
      blocks.push({ type: level === 1 ? 'title' : level === 2 ? 'h2' : 'h3', spans });
      continue;
    }
    const bullet = /^- (\S.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      flushTable();
      list.push(parseInline(bullet[1] ?? ''));
      continue;
    }
    flushList();
    flushTable();
    paragraph.push(line.trim());
  }
  flushAll();
  return blocks;
}

/** The plain text of some spans, for titles and labels. */
export const plainText = (spans: Span[]): string => spans.map((span) => span.text).join('');
