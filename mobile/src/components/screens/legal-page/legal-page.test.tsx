import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking, useWindowDimensions } from 'react-native';

import { legalDocuments } from '@/features/legal/documents';
import { legalLanguages, legalPageIds } from '@/features/legal/pages';

import { LegalPage, legalTitle } from './legal-page';
import { MarkdownView } from './markdown-view';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 })),
}));

const setWidth = (width: number) =>
  jest.mocked(useWindowDimensions).mockReturnValue({ width, height: 800, scale: 2, fontScale: 1 });

beforeEach(() => {
  setWidth(390);
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('LegalPage', () => {
  it('shows the title, the date and the text in French', async () => {
    const { markdown, updated } = legalDocuments.terms.fr;
    await render(
      <LegalPage
        location={{ language: 'fr', page: 'terms' }}
        markdown={markdown}
        updated={updated}
      />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(legalTitle(markdown));
    expect(screen.getByText('Mis à jour le 5 novembre 2026')).toBeOnTheScreen();
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(2);
  });

  it('shows the date in English too', async () => {
    const { markdown, updated } = legalDocuments.support.en;
    await render(
      <LegalPage
        location={{ language: 'en', page: 'support' }}
        markdown={markdown}
        updated={updated}
      />,
    );
    expect(screen.getByText('Last updated 5 November 2026')).toBeOnTheScreen();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Help and contact');
  });

  it.each([
    ['fr', 'terms', 'English', '/en/terms'],
    ['en', 'deletion', 'Français', '/fr/suppression'],
    ['fr', 'support', 'English', '/en/support'],
  ] as const)('links the %s %s page to the other language', async (language, page, label, path) => {
    const { markdown, updated } = legalDocuments[page][language];
    await render(<LegalPage location={{ language, page }} markdown={markdown} updated={updated} />);
    fireEvent.press(screen.getByText(label));
    expect(Linking.openURL).toHaveBeenCalledWith(path);
  });

  it('links to the four pages in its own language, above and below the text', async () => {
    const { markdown, updated } = legalDocuments.privacy.fr;
    await render(
      <LegalPage
        location={{ language: 'fr', page: 'privacy' }}
        markdown={markdown}
        updated={updated}
      />,
    );
    for (const name of ['Confidentialité', 'Conditions', 'Assistance', 'Supprimer mon compte']) {
      expect(screen.getAllByText(name)).toHaveLength(2);
    }
    fireEvent.press(screen.getAllByText('Assistance')[0]!);
    expect(Linking.openURL).toHaveBeenCalledWith('/fr/assistance');
  });

  it('opens the support address as a mail link', async () => {
    const { markdown, updated } = legalDocuments.support.en;
    await render(
      <LegalPage
        location={{ language: 'en', page: 'support' }}
        markdown={markdown}
        updated={updated}
      />,
    );
    fireEvent.press(screen.getAllByText('support@flimme.com')[0]!);
    expect(Linking.openURL).toHaveBeenCalledWith('mailto:support@flimme.com');
  });

  it('credits TMDB and JustWatch', async () => {
    const { markdown, updated } = legalDocuments.terms.en;
    await render(
      <LegalPage
        location={{ language: 'en', page: 'terms' }}
        markdown={markdown}
        updated={updated}
      />,
    );
    expect(screen.getByText(/uses the TMDB API/)).toBeOnTheScreen();
    expect(screen.getByText(/JustWatch/)).toBeOnTheScreen();
  });

  it.each(
    legalLanguages.flatMap((language) => legalPageIds.map((page) => [language, page] as const)),
  )('renders the %s %s page with a title', async (language, page) => {
    const { markdown, updated } = legalDocuments[page][language];
    await render(<LegalPage location={{ language, page }} markdown={markdown} updated={updated} />);
    expect(screen.getByRole('heading', { level: 1 })).toBeOnTheScreen();
  });
});

describe('MarkdownView', () => {
  const table =
    '# T\n\n| Data | Why |\n| --- | --- |\n| Name | To show you |\n| Mail | To answer |\n';

  it('draws bullets as a list', async () => {
    await render(<MarkdownView markdown={'# T\n\n- One\n- Two\n'} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('draws a table with its column names above the rows on a wide screen', async () => {
    setWidth(1024);
    await render(<MarkdownView markdown={table} />);
    expect(screen.getAllByRole('columnheader')).toHaveLength(2);
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('stacks the rows of a table on a narrow screen, naming each column', async () => {
    setWidth(360);
    await render(<MarkdownView markdown={table} />);
    expect(screen.queryAllByRole('columnheader')).toHaveLength(0);
    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.getAllByText('Why')).toHaveLength(2);
    expect(screen.getByText('To show you')).toBeOnTheScreen();
  });
});
