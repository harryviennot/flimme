import { fireEvent, render, screen } from '@testing-library/react-native';
import { View } from 'react-native';

import { Chip } from './chip';

describe('Chip', () => {
  it('stays a checkbox without a role', async () => {
    await render(<Chip label="Cozy" selected />);
    expect(screen.getByRole('checkbox', { name: 'Cozy' })).toBeChecked();
  });

  it('is a radio in a radiogroup when asked, and presses', async () => {
    const onPress = jest.fn();
    await render(
      <View accessibilityRole="radiogroup" accessibilityLabel="Time budget">
        <Chip role="radio" label="Under 2 h" selected onPress={onPress} />
        <Chip role="radio" label="Any length" />
      </View>,
    );
    expect(screen.getByRole('radiogroup', { name: 'Time budget' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Under 2 h' })).toBeSelected();
    expect(screen.getByRole('radio', { name: 'Any length' })).not.toBeSelected();
    await fireEvent.press(screen.getByRole('radio', { name: 'Under 2 h' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
