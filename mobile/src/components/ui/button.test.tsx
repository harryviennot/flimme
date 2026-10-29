import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from './button';

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
});
