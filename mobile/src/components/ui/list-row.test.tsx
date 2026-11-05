import { fireEvent, render, screen } from '@testing-library/react-native';

import { ListRow } from './list-row';
import { Toggle } from './toggle';

describe('ListRow', () => {
  it('presses, and reads its label with its value', async () => {
    const onPress = jest.fn();
    await render(<ListRow label="Language" value="English" onPress={onPress} />);
    await fireEvent.press(screen.getByLabelText('Language, English'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ignores presses while loading and says it is busy', async () => {
    const onPress = jest.fn();
    await render(<ListRow label="Download" loading onPress={onPress} />);
    const row = screen.getByLabelText('Download');
    await fireEvent.press(row);
    expect(onPress).not.toHaveBeenCalled();
    expect(row.props.accessibilityState).toMatchObject({ busy: true });
  });

  it('ignores presses when disabled', async () => {
    const onPress = jest.fn();
    await render(<ListRow label="Contact" disabled onPress={onPress} />);
    await fireEvent.press(screen.getByLabelText('Contact'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('hides its label from screen readers when a control sits on the right', async () => {
    await render(
      <ListRow
        label="Sound"
        trailing={<Toggle value onValueChange={() => undefined} accessibilityLabel="Sound" />}
      />,
    );
    const label = screen.getByText('Sound', { includeHiddenElements: true });
    expect(label.props.accessibilityElementsHidden).toBe(true);
    expect(label.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(screen.getByRole('switch')).toBeOnTheScreen();
  });

  it('wraps its label to two lines and draws no chevron in the danger tone', async () => {
    await render(<ListRow label="Delete my data" tone="danger" onPress={() => undefined} />);
    expect(screen.getByText('Delete my data').props.numberOfLines).toBe(2);
  });
});
