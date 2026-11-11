import { fireEvent, render, screen } from '@testing-library/react-native';

import { ListRow } from './list-row';
import { Toggle } from './toggle';

describe('ListRow', () => {
  it('never shrinks its label for a long value: the value truncates instead', async () => {
    await render(
      <ListRow label="Tes genres ce soir" value="Action, Comédie, Science-fiction, Thriller" />,
    );
    const label = screen.getByText('Tes genres ce soir');
    const value = screen.getByText('Action, Comédie, Science-fiction, Thriller');
    expect(label.parent?.props.className).toContain('shrink-0');
    expect(label.props.numberOfLines).toBe(2);
    expect(value.props.numberOfLines).toBe(1);
  });

  it('draws a description under the label on one line, and reads it with the label', async () => {
    const onPress = jest.fn();
    await render(<ListRow label="Brad Pitt" description="Fight Club (1999)" onPress={onPress} />);
    expect(screen.getByText('Fight Club (1999)').props.numberOfLines).toBe(1);
    await fireEvent.press(screen.getByLabelText('Brad Pitt, Fight Club (1999)'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('a checked row shows its value and reads as selected; a label can be replaced', async () => {
    await render(
      <ListRow
        label="Brad Pitt"
        description="Fight Club (1999)"
        value="Already on your list"
        checked
        accessibilityLabel="Brad Pitt, Fight Club (1999)"
        onPress={() => undefined}
      />,
    );
    expect(screen.getByText('Already on your list')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Brad Pitt, Fight Club (1999)' })).toBeSelected();
  });

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
