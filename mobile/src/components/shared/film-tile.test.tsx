import { fireEvent, render, screen } from '@testing-library/react-native';

import { FilmTile } from './film-tile';

const base = {
  width: 100,
  title: 'Heat',
  year: 1995,
  accessibilityLabel: 'Heat, 1995',
};

describe('FilmTile', () => {
  it('shows the title and year on a placeholder when there is no poster', async () => {
    await render(<FilmTile {...base} poster={null} />);
    expect(screen.getByTestId('film-tile-placeholder')).toBeTruthy();
    expect(screen.getByText('Heat')).toBeTruthy();
    expect(screen.getByText('1995')).toBeTruthy();
  });

  it('has no placeholder with a poster', async () => {
    await render(<FilmTile {...base} poster={{ uri: 'https://x/p.jpg' }} />);
    expect(screen.queryByTestId('film-tile-placeholder')).toBeNull();
  });

  it('draws the Picked tag, or the star, not both', async () => {
    const { rerender } = await render(
      <FilmTile {...base} poster={null} badge={{ kind: 'picked', label: 'Picked' }} />,
    );
    expect(screen.getByText('Picked', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('film-tile-star', { includeHiddenElements: true })).toBeNull();
    await rerender(<FilmTile {...base} poster={null} badge={{ kind: 'super' }} />);
    expect(screen.getByTestId('film-tile-star', { includeHiddenElements: true })).toBeTruthy();
  });

  it('presses, and not when disabled', async () => {
    const onPress = jest.fn();
    const { rerender } = await render(<FilmTile {...base} poster={null} onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Heat, 1995' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    await rerender(<FilmTile {...base} poster={null} onPress={onPress} disabled />);
    await fireEvent.press(screen.getByRole('button', { name: 'Heat, 1995' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
