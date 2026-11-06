import i18n from '@/i18n';

import type { NextCard } from '@flimme/contract';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setSynopsisCard } from '@/features/swipe/synopsis';

import { SynopsisSheet } from './synopsis-sheet';

const frame = {
  frame: { x: 0, y: 0, width: 375, height: 812 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const Sheet = (props: React.ComponentProps<typeof SynopsisSheet>) => (
  <SafeAreaProvider initialMetrics={frame}>
    <SynopsisSheet {...props} />
  </SafeAreaProvider>
);

const card = {
  title_id: 7,
  title: 'Paddington 2',
  overview: 'A bear in prison, and a very long story after that.',
  year: 2017,
  runtime_min: 103,
  tmdb_score: 7.44,
} as NextCard;

afterEach(async () => {
  setSynopsisCard(null);
  await i18n.changeLanguage('en');
});

describe('the synopsis sheet', () => {
  it('shows the title, the meta line with the score and the whole overview', async () => {
    setSynopsisCard(card);
    await render(<Sheet titleId={7} onClose={jest.fn()} />);
    expect(screen.getByRole('header', { name: 'Paddington 2' })).toBeOnTheScreen();
    expect(screen.getByText(/2017 · 1 h 43/)).toBeOnTheScreen();
    expect(screen.getByText('★ 7.4')).toBeOnTheScreen();
    expect(screen.getByText(card.overview!)).toBeOnTheScreen();
    expect(screen.queryByText('Trailer')).toBeNull();
  });

  it('reads in French with the decimal comma', async () => {
    await i18n.changeLanguage('fr');
    setSynopsisCard(card);
    await render(<Sheet titleId={7} onClose={jest.fn()} />);
    expect(screen.getByText('★ 7,4')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeOnTheScreen();
  });

  it('closes with the Close button', async () => {
    setSynopsisCard(card);
    const onClose = jest.fn();
    await render(<Sheet titleId={7} onClose={onClose} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes by itself when the card is not on the phone', async () => {
    const onClose = jest.fn();
    await render(<Sheet titleId={7} onClose={onClose} />);
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByText('Paddington 2')).toBeNull();
  });

  it('closes when the card goes while the sheet is open', async () => {
    setSynopsisCard(card);
    const onClose = jest.fn();
    await render(<Sheet titleId={7} onClose={onClose} />);
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => setSynopsisCard(null));
    expect(onClose).toHaveBeenCalled();
  });
});
