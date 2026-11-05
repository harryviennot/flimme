import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Sharing from 'expo-sharing';
import { PixelRatio } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import i18n from '@/i18n';
import { recapCaptureSize } from '@/features/recap/use-recap-share';
import { track } from '@/lib/analytics';
import { showToast } from '@/components/ui/toast';

import { RecapSheet, previewScale } from './recap-sheet';

type View =
  | { status: 'loading' }
  | { status: 'offline' }
  | { status: 'closed' }
  | { status: 'error'; retry: () => void }
  | {
      status: 'ready';
      title: string;
      posterUri: string | null;
      thumbhash: undefined;
      seconds: number | null;
      people: number;
      swipes: number;
      site: string;
    };

let mockView: View;
let mockPosterLoads = true;
const mockBack = jest.fn();
jest.mock('@/features/recap/use-recap', () => ({ useRecap: () => mockView }));
jest.mock('expo-router', () => ({
  router: { back: (...args: unknown[]) => mockBack(...args), canGoBack: () => true },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(async () => 'file:///cache/recap.png'),
}));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(async () => undefined) }));
const mockDelete = jest.fn();
jest.mock('expo-file-system', () => ({
  File: function File(this: { delete: () => void }, uri: string) {
    this.delete = () => mockDelete(uri);
  },
}));
jest.mock('@/lib/analytics', () => ({ track: jest.fn() }));
jest.mock('@/lib/sentry', () => ({ reportError: jest.fn() }));
jest.mock('@/components/ui/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/components/ui/marquee-bulbs', () => ({ MarqueeBulbs: () => null }));
jest.mock('@/components/shared/poster', () => ({
  Poster: ({ onSettled }: { onSettled?: () => void }) => {
    if (mockPosterLoads) onSettled?.();
    return null;
  },
}));

const idle = () =>
  waitFor(() =>
    expect(screen.getByRole('button', { name: 'Share' }).props.accessibilityState.busy).toBe(false),
  );
const HIDDEN = { includeHiddenElements: true };
const hidden = (text: string) => screen.getAllByText(text, HIDDEN);

const ready = (patch: Partial<Extract<View, { status: 'ready' }>> = {}): View => ({
  status: 'ready',
  title: 'Paddington 2',
  posterUri: 'https://image.tmdb.org/t/p/w342/p.jpg',
  thumbhash: undefined,
  seconds: 222,
  people: 3,
  swipes: 41,
  site: 'flimme.com',
  ...patch,
});

beforeEach(async () => {
  jest.clearAllMocks();
  await i18n.changeLanguage('en');
  mockView = ready();
  mockPosterLoads = true;
});

describe('the recap card (recap.md#the-card)', () => {
  it('holds the poster frame, title, time, counts and the link, and nothing personal', async () => {
    await render(<RecapSheet roomId="r1" />);
    const card = screen.getAllByTestId('recap-card', HIDDEN)[0]!;
    expect(card).toBeTruthy();
    expect(hidden('Paddington 2').length).toBeGreaterThan(0);
    expect(hidden('In 3 min 42 s').length).toBeGreaterThan(0);
    expect(hidden('3').length).toBeGreaterThan(0);
    expect(hidden('people').length).toBeGreaterThan(0);
    expect(hidden('41').length).toBeGreaterThan(0);
    expect(hidden('Made with Flimme · flimme.com').length).toBeGreaterThan(0);
    // The sheet may say "No names", but the card never carries a code, avatar or service.
    expect(screen.queryByTestId('avatar')).toBeNull();
    expect(screen.queryByText(/[A-Z0-9]{6}/)).toBeNull();
  });

  it('says "person" for one person, in French too', async () => {
    mockView = ready({ people: 1, swipes: 1 });
    await render(<RecapSheet roomId="r1" />);
    expect(hidden('person').length).toBeGreaterThan(0);
    expect(hidden('swipe').length).toBeGreaterThan(0);
    await i18n.changeLanguage('fr');
    await render(<RecapSheet roomId="r1" />);
    expect(hidden('personne').length).toBeGreaterThan(0);
    expect(hidden('En 3 min 42 s').length).toBeGreaterThan(0);
  });

  it('leaves the time line out when the room has no times', async () => {
    mockView = ready({ seconds: null });
    await render(<RecapSheet roomId="r1" />);
    expect(screen.queryAllByText(/^In /, HIDDEN)).toHaveLength(0);
  });

  it('puts the card in one labelled image for a screen reader', async () => {
    await render(<RecapSheet roomId="r1" />);
    expect(
      screen.getByLabelText('Recap: Paddington 2, picked in 3 min 42 s. 3 people, 41 swipes.'),
    ).toBeTruthy();
  });
});

describe('sharing (recap.md#sharing)', () => {
  it('captures the full-size card, shares the PNG, tracks once and deletes the file', async () => {
    await render(<RecapSheet roomId="r1" />);
    fireEvent.press(screen.getByRole('button', { name: 'Share' }));
    await waitFor(() => expect(track).toHaveBeenCalledTimes(1));
    expect(track).toHaveBeenCalledWith('winner:recap_share', { method: 'share_sheet' });
    expect(captureRef).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ format: 'png', ...recapCaptureSize(PixelRatio.get()) }),
    );
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      'file:///cache/recap.png',
      expect.objectContaining({ mimeType: 'image/png', UTI: 'public.png' }),
    );
    expect(mockDelete).toHaveBeenCalledWith('file:///cache/recap.png');
    await idle();
  });

  it('tracks nothing when the system says the share was cancelled', async () => {
    (Sharing.shareAsync as jest.Mock).mockRejectedValueOnce(new Error('cancelled'));
    await render(<RecapSheet roomId="r1" />);
    fireEvent.press(screen.getByRole('button', { name: 'Share' }));
    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(track).not.toHaveBeenCalled();
    await idle();
  });

  it('warns when the image could not be made, and shares nothing', async () => {
    (captureRef as jest.Mock).mockRejectedValueOnce(new Error('blank'));
    await render(<RecapSheet roomId="r1" />);
    fireEvent.press(screen.getByRole('button', { name: 'Share' }));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Couldn't make the image. Try again." }),
      ),
    );
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    await idle();
  });

  it('takes one share at a time on a double tap', async () => {
    await render(<RecapSheet roomId="r1" />);
    const share = screen.getByRole('button', { name: 'Share' });
    await act(async () => {
      fireEvent.press(share);
      fireEvent.press(share);
    });
    await waitFor(() => expect(track).toHaveBeenCalledTimes(1));
    expect(captureRef).toHaveBeenCalledTimes(1);
    await idle();
  });

  it('waits for the poster before capturing (the gate keeps the 3 seconds)', async () => {
    mockPosterLoads = false;
    await render(<RecapSheet roomId="r1" />);
    fireEvent.press(screen.getByRole('button', { name: 'Share' }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(captureRef).not.toHaveBeenCalled();
    // It goes ahead with the placeholder after 3 seconds.
    await waitFor(() => expect(captureRef).toHaveBeenCalledTimes(1), { timeout: 4000 });
    await idle();
  });
});

describe('the sheet states (recap.md#states)', () => {
  it('shows a skeleton and a disabled Share while loading', async () => {
    mockView = { status: 'loading' };
    await render(<RecapSheet roomId="r1" />);
    expect(screen.getByTestId('recap-loading')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Share' }).props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  it('says it is offline before the reads, with no Share', async () => {
    mockView = { status: 'offline' };
    await render(<RecapSheet roomId="r1" />);
    expect(screen.getByText("You're offline. The recap shows when you're back.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
  });

  it('offers a retry when a read failed, with no Share', async () => {
    const retry = jest.fn();
    mockView = { status: 'error', retry };
    await render(<RecapSheet roomId="r1" />);
    expect(screen.getByText("Couldn't load the recap.")).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
  });

  it('closes for a solo room or a room with no pick', async () => {
    mockView = { status: 'closed' };
    await render(<RecapSheet roomId="r1" />);
    expect(mockBack).toHaveBeenCalled();
  });

  it('closes with the Close button', async () => {
    await render(<RecapSheet roomId="r1" />);
    fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(mockBack).toHaveBeenCalled();
  });
});

describe('the image size', () => {
  it('is 1080 by 1920 pixels on any screen scale', () => {
    expect(recapCaptureSize(3)).toEqual({ width: 360, height: 640 });
    expect(recapCaptureSize(2)).toEqual({ width: 540, height: 960 });
  });
});

describe('the preview scale', () => {
  it('fits the card in both directions and never grows it', () => {
    expect(previewScale(335, 410)).toBeCloseTo(410 / 640);
    expect(previewScale(200, 900)).toBeCloseTo(200 / 360);
    expect(previewScale(900, 900)).toBe(1);
    expect(previewScale(0, 0)).toBe(0);
  });
});
