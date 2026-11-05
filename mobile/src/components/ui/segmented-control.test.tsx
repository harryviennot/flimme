import { fireEvent, render, screen } from '@testing-library/react-native';

import { SegmentedControl } from './segmented-control';

const segments = [
  { key: 'liked', label: 'Liked' },
  { key: 'seen', label: 'Seen' },
];

describe('SegmentedControl', () => {
  it('reads as tabs with the selected one marked', async () => {
    await render(<SegmentedControl segments={segments} selected="seen" onSelect={jest.fn()} />);
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.getByRole('tab', { name: 'Seen' }).props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByRole('tab', { name: 'Liked' }).props.accessibilityState).toMatchObject({
      selected: false,
    });
  });

  it('selects the pressed segment', async () => {
    const onSelect = jest.fn();
    await render(<SegmentedControl segments={segments} selected="liked" onSelect={onSelect} />);
    await fireEvent.press(screen.getByRole('tab', { name: 'Seen' }));
    expect(onSelect).toHaveBeenCalledWith('seen');
  });
});
