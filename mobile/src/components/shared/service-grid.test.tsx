import '@/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { ServiceGrid } from './service-grid';

const services = [
  { id: 8, name: 'Netflix', logo: 'https://img.test/t/p/w92/n.jpg' },
  { id: 119, name: 'Prime Video' },
  { id: 337, name: 'Disney+' },
  { id: 381, name: 'Canal+' },
];

let mockFontScale = 1;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 375, height: 812, scale: 3, fontScale: mockFontScale }),
}));
const fontScale = (scale: number) => {
  mockFontScale = scale;
};

describe('ServiceGrid', () => {
  it('shows two rows of three placeholders at the largest text size', async () => {
    fontScale(2);
    await render(<ServiceGrid services={services} selected={[]} onToggle={jest.fn()} loading />);
    for (const row of screen.getAllByTestId('service-grid-loading-row'))
      expect(row.children).toHaveLength(3);
  });

  it('shows two rows of four placeholders and no tile while loading', async () => {
    fontScale(1);
    await render(<ServiceGrid services={services} selected={[]} onToggle={jest.fn()} loading />);
    const rows = screen.getAllByTestId('service-grid-loading-row');
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.children).toHaveLength(4);
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

  it('shows every service, with the JustWatch credit', async () => {
    await render(<ServiceGrid services={services} selected={[]} onToggle={jest.fn()} />);
    for (const { name } of services)
      expect(screen.getByRole('checkbox', { name })).toBeOnTheScreen();
    expect(screen.getByText('Streaming availability by JustWatch.')).toBeOnTheScreen();
  });

  it('shows a logo when there is one and the initials when there is not', async () => {
    await render(<ServiceGrid services={services} selected={[]} onToggle={jest.fn()} />);
    expect(screen.getAllByTestId('service-tile-logo')).toHaveLength(1);
    expect(screen.getByText('PV')).toBeOnTheScreen();
    expect(screen.getByText('D')).toBeOnTheScreen();
  });

  it('falls back to the initials when the logo fails to load', async () => {
    await render(<ServiceGrid services={services} selected={[]} onToggle={jest.fn()} />);
    await fireEvent(screen.getByTestId('service-tile-logo'), 'error', { nativeEvent: {} });
    expect(screen.queryAllByTestId('service-tile-logo')).toHaveLength(0);
    expect(screen.getByText('N')).toBeOnTheScreen();
  });

  it('badges only the selected tiles', async () => {
    await render(<ServiceGrid services={services} selected={[8, 119]} onToggle={jest.fn()} />);
    expect(screen.getAllByTestId('service-tile-check')).toHaveLength(2);
  });
});
