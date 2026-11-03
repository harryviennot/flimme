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
    const rows = screen.getAllByTestId('service-grid-loading-row');
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.children).toHaveLength(3);
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
