import i18n from '@/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { GenreChips } from './genre-chips';

const options = [
  { id: 1, name: 'Action', count: 2 },
  { id: 2, name: 'Comedy', count: 0 },
];

describe('GenreChips', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('toggles by id and shows the selection', async () => {
    const onToggle = jest.fn();
    await render(<GenreChips options={options} selected={[1]} showCounts onToggle={onToggle} />);
    expect(screen.getByRole('checkbox', { name: /Action/ })).toBeChecked();
    await fireEvent.press(screen.getByRole('checkbox', { name: /Comedy/ }));
    expect(onToggle).toHaveBeenCalledWith(2);
  });

  it('draws counts only when asked and above 0', async () => {
    const { rerender } = await render(
      <GenreChips options={options} selected={[]} showCounts onToggle={() => {}} />,
    );
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
    await rerender(
      <GenreChips options={options} selected={[]} showCounts={false} onToggle={() => {}} />,
    );
    expect(screen.queryByText('2')).toBeNull();
  });

  it('draws no chip while loading', async () => {
    await render(
      <GenreChips options={options} selected={[]} showCounts onToggle={() => {}} loading />,
    );
    expect(screen.queryByText('Action')).toBeNull();
  });

  it('skip mode draws no counts and labels each chip Skip <name>', async () => {
    const onToggle = jest.fn();
    await render(
      <GenreChips mode="skip" options={options} selected={[1]} showCounts onToggle={onToggle} />,
    );
    expect(screen.queryByText('2')).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Skip Action' })).toBeChecked();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Skip Comedy' }));
    expect(onToggle).toHaveBeenCalledWith(2);
  });

  it('pick mode draws out tonight chips: disabled, labelled, no count, never pressed', async () => {
    const onToggle = jest.fn();
    await render(
      <GenreChips
        options={options}
        selected={[]}
        outTonight={[1]}
        showCounts
        onToggle={onToggle}
      />,
    );
    const chip = screen.getByRole('checkbox', { name: 'Action, out tonight' });
    expect(chip).toBeDisabled();
    expect(screen.getByText('out tonight')).toBeTruthy();
    expect(screen.queryByText('2')).toBeNull();
    await fireEvent.press(chip);
    expect(onToggle).not.toHaveBeenCalled();
  });
});
