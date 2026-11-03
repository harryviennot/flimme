import '@/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { ServiceGrid } from './service-grid';

const services = [
  { id: 8, name: 'Netflix' },
  { id: 119, name: 'Prime Video' },
  { id: 337, name: 'Disney+' },
  { id: 381, name: 'Canal+' },
];

describe('ServiceGrid', () => {
  it('shows six placeholders and no tile while loading', async () => {
    await render(<ServiceGrid services={services} selected={[]} onToggle={jest.fn()} loading />);
    expect(
      screen
        .getByTestId('service-grid-loading')
        .findAllByProps({ className: 'h-17 flex-1 rounded-md' }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('calls onToggle with the id and marks the selected tiles', async () => {
    const onToggle = jest.fn();
    await render(<ServiceGrid services={services} selected={[119]} onToggle={onToggle} />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
    expect(screen.getByRole('checkbox', { name: 'Prime Video' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Netflix' })).not.toBeChecked();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Disney+' }));
    expect(onToggle).toHaveBeenCalledWith(337);
  });
});
