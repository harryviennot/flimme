import { fireEvent, render, screen } from '@testing-library/react-native';

import { playSound } from '@/lib/sound';

import { Button } from './button';

jest.mock('@/lib/sound', () => ({ playSound: jest.fn(async () => undefined) }));

describe('Button', () => {
  it('shows its label and answers a press', async () => {
    const onPress = jest.fn();
    await render(<Button label="Open the room" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Open the room' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ignores presses when disabled, and says so to screen readers', async () => {
    const onPress = jest.fn();
    await render(<Button label="Start swiping" onPress={onPress} disabled />);
    const button = screen.getByRole('button', { name: 'Start swiping' });
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
  });

  it('ignores presses while loading', async () => {
    const onPress = jest.fn();
    await render(<Button label="Joining" onPress={onPress} loading />);
    await fireEvent.press(screen.getByRole('button', { name: 'Joining' }));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('plays the tap on press-in when it has one, and only then', async () => {
    jest.mocked(playSound).mockClear();
    await render(
      <>
        <Button label="Join" sound="tap" />
        <Button label="Other" />
      </>,
    );
    await fireEvent(screen.getByRole('button', { name: 'Other' }), 'pressIn');
    expect(playSound).not.toHaveBeenCalled();
    await fireEvent(screen.getByRole('button', { name: 'Join' }), 'pressIn');
    expect(playSound).toHaveBeenCalledTimes(1);
    expect(playSound).toHaveBeenCalledWith('tap');
  });

  it('plays no tap when disabled or loading', async () => {
    jest.mocked(playSound).mockClear();
    await render(
      <>
        <Button label="Off" sound="tap" disabled />
        <Button label="Busy" sound="tap" loading />
      </>,
    );
    await fireEvent(screen.getByRole('button', { name: 'Off' }), 'pressIn');
    await fireEvent(screen.getByRole('button', { name: 'Busy' }), 'pressIn');
    expect(playSound).not.toHaveBeenCalled();
  });
});
