import { parseInline, parseMarkdown, plainText } from './markdown';

describe('parseInline', () => {
  it('reads plain text, bold and links in order', () => {
    expect(
      parseInline('A **bold** word, a [link](https://flimme.com) and [mail](mailto:a@b.co).'),
    ).toEqual([
      { text: 'A ' },
      { text: 'bold', bold: true },
      { text: ' word, a ' },
      { text: 'link', href: 'https://flimme.com' },
      { text: ' and ' },
      { text: 'mail', href: 'mailto:a@b.co' },
      { text: '.' },
    ]);
  });

  it('keeps a mailto subject in the address', () => {
    expect(parseInline('[x](mailto:support@flimme.com?subject=Delete%20me)')).toEqual([
      { text: 'x', href: 'mailto:support@flimme.com?subject=Delete%20me' },
    ]);
  });

  it('never turns an unsafe address into a link', () => {
    expect(parseInline('[x](javascript:alert)')).toEqual([{ text: '[x](javascript:alert)' }]);
    expect(parseInline('[x](http://flimme.com)')).toEqual([{ text: '[x](http://flimme.com)' }]);
  });

  it('answers nothing for an empty line', () => {
    expect(parseInline('')).toEqual([]);
  });
});

describe('parseMarkdown', () => {
  const text = [
    '# Title',
    '',
    'First line',
    'second line.',
    '',
    '## Part',
    '',
    '### Detail',
    '',
    '- One **bold**',
    '- Two',
    '',
    'After the list.',
    '',
    '| Data | Why |',
    '| --- | --- |',
    '| Name | To show you |',
    '| Mail | [Ask](mailto:a@b.co) |',
    '',
    'End.',
  ].join('\n');

  it('reads the blocks in order', () => {
    expect(parseMarkdown(text).map((block) => block.type)).toEqual([
      'title',
      'p',
      'h2',
      'h3',
      'list',
      'p',
      'table',
      'p',
    ]);
  });

  it('joins the lines of a paragraph with a space', () => {
    const [, paragraph] = parseMarkdown(text);
    expect(paragraph?.type === 'p' && plainText(paragraph.spans)).toBe('First line second line.');
  });

  it('reads list items with their inline marks', () => {
    const list = parseMarkdown(text)[4];
    expect(list).toEqual({
      type: 'list',
      items: [[{ text: 'One ' }, { text: 'bold', bold: true }], [{ text: 'Two' }]],
    });
  });

  it('reads a table without its separator row', () => {
    const table = parseMarkdown(text)[6];
    expect(table?.type === 'table' && table.header.map(plainText)).toEqual(['Data', 'Why']);
    expect(table?.type === 'table' && table.rows.map((row) => row.map(plainText))).toEqual([
      ['Name', 'To show you'],
      ['Mail', 'Ask'],
    ]);
  });

  it('ends a list or a table when a paragraph follows without a blank line', () => {
    const blocks = parseMarkdown('# T\n- a\nText\n| A |\n| --- |\n| 1 |\nMore');
    expect(blocks.map((block) => block.type)).toEqual(['title', 'list', 'p', 'table', 'p']);
  });

  it('answers nothing for an empty text', () => {
    expect(parseMarkdown('')).toEqual([]);
  });
});
