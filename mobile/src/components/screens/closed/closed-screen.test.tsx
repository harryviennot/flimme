import i18n from '@/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { ClosedScreen } from './closed-screen';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const mockExit = jest.fn();
const mockRelease = jest.fn();
const mockRoom: { data: Record<string, unknown> | undefined } = { data: undefined };
jest.mock('@/features/room', () => ({
  useRoom: () => mockRoom,
  useExitRoomToHome: () => mockExit,
  releaseRoomGuards: () => mockRelease(),
}));

const abandoned = {
  code: '482913',
  state: 'abandoned',
  created_at: '2026-11-04T19:30:00Z',
  ended_at: '2026-11-04T20:04:00Z',
};

beforeEach(async () => {
  jest.clearAllMocks();
  mockRoom.data = abandoned;
  await i18n.changeLanguage('en');
});

describe('the closed room screen', () => {
  it('says the room has closed, names no reason and offers Home', async () => {
    await render(<ClosedScreen roomId="r" />);
    expect(screen.getByText('This room has closed')).toBeTruthy();
    expect(screen.getByText(/This movie night is over/)).toBeTruthy();
    expect(screen.getByText('Closed', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('goes Home with the room guard released first', async () => {
    const order: string[] = [];
    mockRelease.mockImplementation(() => order.push('release'));
    mockExit.mockImplementation(() => order.push('exit'));
    await render(<ClosedScreen roomId="r" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Back to Home' }));
    expect(order).toEqual(['release', 'exit']);
  });

  it('leaves the closing time out when the room has none', async () => {
    mockRoom.data = { ...abandoned, ended_at: null };
    await render(<ClosedScreen roomId="r" />);
    expect(screen.queryByText(/Closed at/, { includeHiddenElements: true })).toBeNull();
  });

  it('shows no ticket but keeps Home when the room row is missing', async () => {
    mockRoom.data = undefined;
    await render(<ClosedScreen roomId="r" />);
    expect(screen.getByText('This room has closed')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back to Home' })).toBeTruthy();
  });

  it('speaks French', async () => {
    await i18n.changeLanguage('fr');
    await render(<ClosedScreen roomId="r" />);
    expect(screen.getByText('Cette salle est fermée')).toBeTruthy();
    expect(screen.getByRole('button', { name: "Retour à l'accueil" })).toBeTruthy();
  });
});
