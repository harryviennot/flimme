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
    expect(screen.getByLabelText('Time budget').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getByRole('radio', { name: 'Under 2 h' })).toBeSelected();
    expect(screen.getByRole('radio', { name: 'Any length' })).not.toBeSelected();
    await fireEvent.press(screen.getByRole('radio', { name: 'Under 2 h' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows a count and reads it in the label the screen gives', async () => {
    await render(<Chip label="Comedy" count={3} accessibilityLabel="Comedy, 3 players" />);
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Comedy, 3 players' })).toBeTruthy();
  });

  it('draws the skipped look with tone nope, still a checkbox', async () => {
    await render(<Chip label="Animation" tone="nope" selected />);
    expect(screen.getByRole('checkbox', { name: 'Animation' })).toBeChecked();
  });

  it('an unavailable chip ignores presses, is disabled, shows its marker and is not dimmed', async () => {
    const onPress = jest.fn();
    await render(<Chip label="Animation" unavailable="out tonight" onPress={onPress} />);
    const chip = screen.getByRole('checkbox', { name: 'Animation' });
    expect(chip).toBeDisabled();
    expect(screen.getByText('out tonight')).toBeTruthy();
    await fireEvent.press(chip);
    expect(onPress).not.toHaveBeenCalled();
    expect(String(chip.props.className ?? '')).not.toContain('opacity-disabled');
  });
});
