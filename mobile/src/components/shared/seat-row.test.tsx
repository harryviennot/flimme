import '@/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { SeatRow, type SeatRowProps } from './seat-row';

const base: SeatRowProps = {
  name: 'Sam',
  color: 'blue',
  detail: '',
  isHost: false,
  isMe: false,
  present: true,
  away: false,
};
const show = (props: Partial<SeatRowProps> = {}) => render(<SeatRow {...base} {...props} />);

describe('SeatRow', () => {
  it('shows the name and no detail line without a detail', async () => {
    await show();
    expect(screen.getByText('Sam')).toBeTruthy();
    expect(screen.queryByText('No services yet')).toBeNull();
  });

  it('shows the detail line it is given', async () => {
    await show({ detail: 'Netflix, Disney+' });
    expect(screen.getByText('Netflix, Disney+')).toBeTruthy();
  });

  it('marks the own seat', async () => {
    await show({ isMe: true });
    expect(screen.getByText('Sam (you)')).toBeTruthy();
  });

  it('shows the crown tag for the host', async () => {
    await show({ isHost: true });
    expect(screen.getByText('Host')).toBeTruthy();
    expect(screen.queryByText('Away')).toBeNull();
  });

  it('shows the Away tag on an away guest', async () => {
    await show({ away: true, present: false });
    expect(screen.getByText('Away')).toBeTruthy();
  });

  it('shows one tag only when the host is away: Away, with the crown after the name', async () => {
    await show({ away: true, present: false, isHost: true, isMe: true });
    expect(screen.getAllByText('Away')).toHaveLength(1);
    expect(screen.queryByText('Host')).toBeNull();
    expect(screen.getByText('Sam (you)')).toBeTruthy();
  });

  it('shows the Done tag on a seat with no cards left', async () => {
    await show({ done: true });
    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.getByLabelText('Sam is done')).toBeTruthy();
  });

  it('shows Done instead of Host for a host who is done', async () => {
    await show({ done: true, isHost: true });
    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.queryByText('Host')).toBeNull();
  });

  it('shows Away over Done', async () => {
    await show({ done: true, away: true, present: false });
    expect(screen.getByText('Away')).toBeTruthy();
    expect(screen.queryByText('Done')).toBeNull();
  });

  it('is a button only when given onPress', async () => {
    const onPress = jest.fn();
    await show({ onPress });
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button').props.accessibilityHint).toBe('Open options for Sam');
  });

  it('is not a button without onPress', async () => {
    await show();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
