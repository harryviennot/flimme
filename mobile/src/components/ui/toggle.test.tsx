import { fireEvent, render, screen } from '@testing-library/react-native';

import { Toggle } from './toggle';

describe('Toggle', () => {
  it('is a switch that flips its value', async () => {
    const onValueChange = jest.fn();
    await render(
      <Toggle value={false} onValueChange={onValueChange} accessibilityLabel="Hide seen films" />,
    );
    const toggle = screen.getByRole('switch', { name: 'Hide seen films' });
    expect(toggle).not.toBeChecked();
    await fireEvent.press(toggle);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });
});
