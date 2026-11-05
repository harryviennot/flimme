import { useMemo } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { Text, type TextTone, type TextVariant } from '@/components/ui/text';
import { type Block, parseMarkdown, plainText, type Span } from '@/features/legal/markdown';

import { LinkText } from '@/components/ui/link-text';

/** Under this width a table's rows stack, each cell under its column name. */
const TABLE_WIDE = 640;
const BULLET = '•';

export type MarkdownViewProps = { markdown: string };

function Spans({ spans, variant, tone }: { spans: Span[]; variant: TextVariant; tone: TextTone }) {
  return spans.map((span, index) => {
    if (span.href) {
      return (
        <LinkText key={index} href={span.href} variant={variant}>
          {span.text}
        </LinkText>
      );
    }
    if (span.bold) {
      return (
        <Text key={index} variant="body-m-strong" tone="primary">
          {span.text}
        </Text>
      );
    }
    return (
      <Text key={index} variant={variant} tone={tone}>
        {span.text}
      </Text>
    );
  });
}

function Paragraph({ spans }: { spans: Span[] }) {
  return (
    <Text variant="body-m" tone="secondary">
      <Spans spans={spans} variant="body-m" tone="secondary" />
    </Text>
  );
}

function List({ items }: { items: Span[][] }) {
  return (
    <View role="list" className="gap-2">
      {items.map((item, index) => (
        <View key={index} role="listitem" className="flex-row gap-3">
          <Text variant="body-m" tone="marquee" aria-hidden>
            {BULLET}
          </Text>
          <Text variant="body-m" tone="secondary" className="flex-1">
            <Spans spans={item} variant="body-m" tone="secondary" />
          </Text>
        </View>
      ))}
    </View>
  );
}

function Table({ header, rows }: { header: Span[][]; rows: Span[][][] }) {
  const { width } = useWindowDimensions();
  const wide = width >= TABLE_WIDE;
  if (wide) {
    return (
      <View role="table" className="overflow-hidden rounded-md border border-border-default">
        <View role="row" className="flex-row gap-4 bg-bg-raised p-3">
          {header.map((cell, index) => (
            <View key={index} role="columnheader" className="flex-1">
              <Text variant="body-m-strong">
                <Spans spans={cell} variant="body-m-strong" tone="primary" />
              </Text>
            </View>
          ))}
        </View>
        {rows.map((row, rowIndex) => (
          <View
            key={rowIndex}
            role="row"
            className="flex-row gap-4 border-t border-border-default p-3"
          >
            {row.map((cell, index) => (
              <View key={index} role="cell" className="flex-1">
                <Text variant="body-s" tone="secondary">
                  <Spans spans={cell} variant="body-s" tone="secondary" />
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  }
  return (
    <View role="table" className="gap-3">
      {rows.map((row, rowIndex) => (
        <View
          key={rowIndex}
          role="row"
          className="gap-2 rounded-md border border-border-default bg-bg-surface p-3"
        >
          {row.map((cell, index) => (
            <View key={index} role="cell" className="gap-0.5">
              {index === 0 ? null : (
                <Text variant="mono-eyebrow" tone="muted">
                  {header[index]?.map((span) => span.text).join('') ?? ''}
                </Text>
              )}
              <Text variant={index === 0 ? 'body-m-strong' : 'body-s'} tone="secondary">
                <Spans
                  spans={cell}
                  variant={index === 0 ? 'body-m-strong' : 'body-s'}
                  tone="secondary"
                />
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case 'title':
      return null; // The page draws its own title, so it can sit next to the date.
    case 'h2':
      return (
        <Text variant="display-s" role="heading" aria-level={2} className="pt-4">
          {plainText(block.spans)}
        </Text>
      );
    case 'h3':
      return (
        <Text variant="title-m" role="heading" aria-level={3} className="pt-2">
          {plainText(block.spans)}
        </Text>
      );
    case 'p':
      return <Paragraph spans={block.spans} />;
    case 'list':
      return <List items={block.items} />;
    case 'table':
      return <Table header={block.header} rows={block.rows} />;
  }
}

/** The legal Markdown subset, drawn with the theme. The # title is the page's, not drawn here. */
export function MarkdownView({ markdown }: MarkdownViewProps) {
  const blocks = useMemo(() => parseMarkdown(markdown), [markdown]);
  return (
    <View className="gap-4">
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} />
      ))}
    </View>
  );
}
