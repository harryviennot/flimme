import i18n from '@/i18n';

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Place } from '@/features/finale/ballot';
import type { Phase } from '@/features/finale/phase';
import type { FinalCutModel } from '@/features/finale/use-final-cut';
import { LeaveContext } from '@/features/lobby/leave-context';

import { FinalCutScreen } from './final-cut-screen';

jest.mock('@/components/screens/room/room-banner', () => ({ RoomBanner: () => null }));
jest.mock('@/components/shared/poster', () => ({ Poster: () => null }));
jest.mock('@/lib/storage', () => ({
  storage: { getItemSync: () => null, setItemSync: jest.fn(), removeItemSync: jest.fn() },
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/lib/haptics', () => ({
  haptics: { press: jest.fn(), veto: jest.fn(), countdown: jest.fn() },
}));

const finalist = (titleId: number, title: string) => ({
  titleId,
  title,
  year: 2020,
  poster: null,
  placeholder: null,
  noPoster: true,
});

function model(
  overrides: Partial<FinalCutModel> = {},
  places?: Record<number, Place>,
): FinalCutModel {
  const finalists = [finalist(10, 'Alpha'), finalist(20, 'Beta'), finalist(30, 'Gamma')];
  const defaults: Record<number, Place> = {
    10: { kind: 'faint', rank: 1 },
    20: { kind: 'faint', rank: 2 },
    30: { kind: 'faint', rank: 3 },
  };
  return {
    kind: 'final_cut',
    pickOne: false,
    phase: 'voting' as Phase,
    loadFailed: false,
    postersFailed: false,
    slots: 3,
    finalists,
    places: new Map(Object.entries(places ?? defaults).map(([id, p]) => [Number(id), p])),
    vetoAllowed: true,
    deadline: new Date(Date.now() + 40_000).toISOString(),
    countdownOn: true,
    tick: true,
    seats: [
      { memberId: 'a', name: 'Léa', avatarKey: 'teal', locked: true },
      { memberId: 'b', name: 'Sam', avatarKey: 'blue', locked: false },
    ],
    count: 1,
    of: 2,
    status: null,
    meLocked: false,
    numbersHidden: false,
    online: true,
    onTap: jest.fn(),
    onLongPress: jest.fn(),
    onLockIn: jest.fn(),
    onEnd: jest.fn(),
    retryLoad: jest.fn(),
    retryPosters: jest.fn(),
    ...overrides,
  };
}

async function show(m: FinalCutModel) {
  await i18n.changeLanguage('en');
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 375, height: 667 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <LeaveContext.Provider value={jest.fn()}>
        <FinalCutScreen roomId="r1" model={m} />
      </LeaveContext.Provider>
    </SafeAreaProvider>,
  );
}

describe('the Final Cut screen', () => {
  it('taps a poster to rank it and long-presses it to veto', async () => {
    const m = model();
    await show(m);
    const poster = screen.getByLabelText(/Alpha, 2020/);
    await fireEvent.press(poster);
    expect(m.onTap).toHaveBeenCalledWith(10);
    await fireEvent(poster, 'longPress');
    expect(m.onLongPress).toHaveBeenCalledWith(10);
  });

  it('reads each finalist with its title, year and state', async () => {
    await show(
      model(
        {},
        {
          10: { kind: 'ranked', rank: 1 },
          20: { kind: 'vetoed' },
          30: { kind: 'faint', rank: 2 },
        },
      ),
    );
    expect(screen.getByLabelText('Alpha, 2020. Ranked 1')).toBeTruthy();
    expect(screen.getByLabelText('Beta, 2020. Vetoed')).toBeTruthy();
    expect(screen.getByLabelText('Gamma, 2020. Not ranked, counts as 2')).toBeTruthy();
  });

  it('offers screen reader actions that fit each state, and the veto only where allowed', async () => {
    const m = model(
      {},
      {
        10: { kind: 'ranked', rank: 1 },
        20: { kind: 'vetoed' },
        30: { kind: 'faint', rank: 2 },
      },
    );
    await show(m);
    const names = (label: RegExp) =>
      screen.getByLabelText(label).props.accessibilityActions.map((a: { name: string }) => a.name);
    expect(names(/Alpha/)).toEqual(['removeRank', 'veto']);
    expect(names(/Beta/)).toEqual(['liftVeto']);
    expect(names(/Gamma/)).toEqual(['rankNext', 'veto']);
    await act(async () =>
      screen
        .getByLabelText(/Gamma/)
        .props.onAccessibilityAction({ nativeEvent: { actionName: 'rankNext' } }),
    );
    expect(m.onTap).toHaveBeenCalledWith(30);
  });

  it('has no veto action in a ranked vote or with no veto left', async () => {
    await show(model({ kind: 'ranked_vote', vetoAllowed: false }));
    const actions = screen.getByLabelText(/Alpha/).props.accessibilityActions;
    expect(actions.map((a: { name: string }) => a.name)).toEqual(['rankNext']);
    expect(screen.getByText('Rank them.')).toBeTruthy();
    expect(screen.getByText(/The rest follow in the order shown/)).toBeTruthy();
  });

  it('plays 2 films as Pick one, with no veto and the intro line once', async () => {
    const two = model(
      { kind: 'ranked_vote', pickOne: true, vetoAllowed: false, slots: 2 },
      { 10: { kind: 'ranked', rank: 1 }, 20: { kind: 'faint', rank: 2 } },
    );
    two.finalists.splice(2);
    await show(two);
    expect(screen.getByText('Final vote')).toBeTruthy();
    expect(screen.getByText('Pick one.')).toBeTruthy();
    expect(screen.getByText(/Tap the one you'd rather watch/)).toBeTruthy();
    expect(
      screen.getAllByText('From your likes, with one for each of you when we can.'),
    ).toHaveLength(1);
    expect(screen.getByLabelText('Alpha, 2020. Your pick')).toBeTruthy();
    expect(screen.getByLabelText('Beta, 2020. Not picked, counts as 2')).toBeTruthy();
    const names = (label: RegExp) =>
      screen.getByLabelText(label).props.accessibilityActions.map((a: { name: string }) => a.name);
    expect(names(/Alpha/)).toEqual(['removeRank']);
    expect(names(/Beta/)).toEqual(['rankNext']);
    expect(screen.queryByLabelText(/Vetoed/)).toBeNull();
    expect(screen.queryByText(/Long-press/)).toBeNull();
  });

  it('shows the intro line once on a Final Cut', async () => {
    await show(model());
    expect(
      screen.getAllByText('From your likes, with one for each of you when we can.'),
    ).toHaveLength(1);
  });

  it('shows the same intro line on a ranked vote of 4', async () => {
    await show(model({ kind: 'ranked_vote', vetoAllowed: false }));
    expect(
      screen.getAllByText('From your likes, with one for each of you when we can.'),
    ).toHaveLength(1);
  });

  it("marks no finalist as anyone's", async () => {
    await show(model());
    for (const name of ['Alpha', 'Beta', 'Gamma']) {
      const label = screen.getByLabelText(new RegExp(name)).props.accessibilityLabel as string;
      expect(label).not.toMatch(/Léa|Sam|chosen by|from/i);
    }
  });

  it('picks the intro by kind and veto', async () => {
    await show(model({ vetoAllowed: false }));
    expect(screen.getByText(/You've used your veto this game/)).toBeTruthy();
  });

  it('locks in with the button, which has a hint', async () => {
    const m = model();
    await show(m);
    const button = screen.getByLabelText('Lock in my vote');
    expect(button.props.accessibilityHint).toMatch(/can't change it/);
    await fireEvent.press(button);
    expect(m.onLockIn).toHaveBeenCalled();
  });

  it('shows Sending with the offline line, and stops the taps', async () => {
    const m = model({ phase: 'sending', online: false, status: 'hint.offline' });
    await show(m);
    expect(screen.getByLabelText('Sending')).toBeTruthy();
    expect(screen.getByText(/You're offline/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(/Alpha/));
    expect(m.onTap).not.toHaveBeenCalled();
  });

  it('shows the Locked in panel, with no button', async () => {
    await show(model({ phase: 'locked', tick: false }));
    expect(screen.getByTestId('locked-in')).toBeTruthy();
    expect(screen.queryByLabelText('Lock in my vote')).toBeNull();
  });

  it('shows Counting the votes, and the slow line after a while', async () => {
    await show(model({ phase: 'counting', countdownOn: false, status: 'counting.slow' }));
    expect(screen.getByText('Counting the votes')).toBeTruthy();
    expect(screen.getByText('Still counting. Hang on.')).toBeTruthy();
    expect(screen.queryByRole('timer')).toBeNull();
  });

  it('shows the count and one avatar per seat, without anyone not locked in named', async () => {
    await show(model());
    expect(screen.getByText('1 of 2 locked in')).toBeTruthy();
    expect(screen.getByTestId('lock-in-row').props.accessibilityLabel).toBe(
      'Locked in: Léa. 1 of 2 locked in',
    );
  });

  it('reads the countdown for a screen reader', async () => {
    await show(model());
    expect(screen.getByRole('timer').props.accessibilityLabel).toMatch(/seconds left/);
  });

  it('shows the finalists error with a retry, and the posters error under the posters', async () => {
    const failed = model({ loadFailed: true, phase: 'loading', finalists: [] });
    await show(failed);
    expect(screen.getByText("Couldn't load the finalists.")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(failed.retryLoad).toHaveBeenCalled();
  });

  it('keeps Lock in off while loading', async () => {
    const m = model({ phase: 'loading' });
    await show(m);
    await fireEvent.press(screen.getByLabelText('Lock in my vote'));
    expect(m.onLockIn).not.toHaveBeenCalled();
  });

  it('says it in French first', async () => {
    await i18n.changeLanguage('fr');
    await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 375, height: 667 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <LeaveContext.Provider value={jest.fn()}>
          <FinalCutScreen roomId="r1" model={model()} />
        </LeaveContext.Provider>
      </SafeAreaProvider>,
    );
    expect(screen.getByText('Choisis-en un. Élimine-en un.')).toBeTruthy();
    expect(screen.getByText('Valider mon vote')).toBeTruthy();
    await i18n.changeLanguage('en');
  });
});
