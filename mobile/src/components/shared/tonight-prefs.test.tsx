import i18n from '@/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { TonightPrefs, type TonightPrefsProps } from './tonight-prefs';

const props: TonightPrefsProps = {
  offered: [
    { id: 16, name: 'Animation', count: 0 },
    { id: 35, name: 'Comedy', count: 2 },
  ],
  allGenres: [
    { id: 16, name: 'Animation' },
    { id: 35, name: 'Comedy' },
    { id: 37, name: 'Western' },
  ],
  outTonight: [],
  picks: [35],
  skipGenres: [],
  skipPeople: [],
  showCounts: true,
  maxPicks: 3,
  maxSkipGenres: 3,
  maxSkipPeople: 3,
  onTogglePick: jest.fn(),
  onToggleSkip: jest.fn(),
  onRemovePerson: jest.fn(),
  onAddPerson: jest.fn(),
};

describe('TonightPrefs', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('draws the two sections with their counts', async () => {
    await render(<TonightPrefs {...props} skipGenres={[37]} />);
    expect(screen.getByText('In the mood for')).toBeTruthy();
    expect(screen.getByText('Not tonight')).toBeTruthy();
    expect(screen.getByLabelText('1 of 3 picked')).toBeTruthy();
    expect(screen.getByLabelText('1 of 3 skipped')).toBeTruthy();
  });

  it('a genre out tonight has a disabled pick chip, while its skip chip stays', async () => {
    const onTogglePick = jest.fn();
    await render(
      <TonightPrefs {...props} outTonight={[16]} skipGenres={[16]} onTogglePick={onTogglePick} />,
    );
    const out = screen.getByRole('checkbox', { name: 'Animation, out tonight' });
    expect(out).toBeDisabled();
    await fireEvent.press(out);
    expect(onTogglePick).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: 'Skip Animation' })).toBeChecked();
  });

  it('lists every genre in the skip row, with no counts', async () => {
    await render(<TonightPrefs {...props} />);
    expect(screen.getByRole('checkbox', { name: 'Skip Western' })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Comedy, 2 players' })).toBeTruthy();
  });

  it('skipping calls the handler with the id', async () => {
    const onToggleSkip = jest.fn();
    await render(<TonightPrefs {...props} onToggleSkip={onToggleSkip} />);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Skip Western' }));
    expect(onToggleSkip).toHaveBeenCalledWith(37);
  });

  it('shows the notes it is given in place of the helper, and the room limit line', async () => {
    await render(
      <TonightPrefs
        {...props}
        wantsNote="Animation is out tonight, so we took it off your picks."
        genresNote="4 genres are already out tonight."
      />,
    );
    expect(screen.getByText(/took it off your picks/)).toBeTruthy();
    expect(screen.queryByText(/Up to 3 genres/)).toBeNull();
    expect(screen.getByText('4 genres are already out tonight.')).toBeTruthy();
  });

  it('draws no chip while loading', async () => {
    await render(<TonightPrefs {...props} loading />);
    expect(screen.queryByText('Comedy')).toBeNull();
  });

  describe('the People row', () => {
    const people = [
      { id: 287, name: 'Brad Pitt' },
      { id: 955, name: 'Pénélope Cruz' },
    ];

    it('lists the skipped people in the order added, with their count', async () => {
      await render(<TonightPrefs {...props} skipPeople={people} />);
      expect(screen.getByLabelText('2 of 3 skipped')).toBeTruthy();
      const chips = screen.getAllByRole('button', { name: /^Remove / });
      expect(chips.map((chip) => chip.props.accessibilityLabel)).toEqual([
        'Remove Brad Pitt',
        'Remove Pénélope Cruz',
      ]);
      expect(chips[0]?.props.accessibilityHint).toBe('Their films come back tonight.');
    });

    it('a press on a chip removes that person', async () => {
      const onRemovePerson = jest.fn();
      await render(<TonightPrefs {...props} skipPeople={people} onRemovePerson={onRemovePerson} />);
      await fireEvent.press(screen.getByRole('button', { name: 'Remove Pénélope Cruz' }));
      expect(onRemovePerson).toHaveBeenCalledWith(955);
    });

    it('Add a person opens the search, and is disabled at the cap with its note', async () => {
      const onAddPerson = jest.fn();
      const { rerender } = await render(<TonightPrefs {...props} onAddPerson={onAddPerson} />);
      await fireEvent.press(screen.getByRole('button', { name: 'Add a person' }));
      expect(onAddPerson).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(/3 people at most/)).toBeNull();
      const three = [...people, { id: 1, name: 'Third' }];
      await rerender(<TonightPrefs {...props} skipPeople={three} onAddPerson={onAddPerson} />);
      expect(screen.getByRole('button', { name: 'Add a person' })).toBeDisabled();
      expect(screen.getByText('3 people at most. Remove one to swap.')).toBeTruthy();
    });

    it('can be used before the genres load', async () => {
      await render(<TonightPrefs {...props} loading />);
      expect(screen.getByRole('button', { name: 'Add a person' })).toBeEnabled();
    });
  });
});
