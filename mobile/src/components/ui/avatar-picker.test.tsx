import { fireEvent, render, screen } from '@testing-library/react-native';

import i18n from '@/i18n';

import { AvatarPicker } from './avatar-picker';

let mockReduceMotion = false;

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return new Proxy(actual, {
    get: (target, key) => (key === 'useReducedMotion' ? () => mockReduceMotion : target[key]),
  });
});
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Rigid: 'rigid', Soft: 'soft' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

const colors = ['blue', 'green', 'gold'] as const;

beforeEach(async () => {
  mockReduceMotion = false;
  await i18n.changeLanguage('en');
});

describe('AvatarPicker', () => {
  it('is a radio group of radios named after their colors, and says which is selected', async () => {
    await render(
      <AvatarPicker
        colors={colors}
        value="green"
        onChange={() => undefined}
        initial="L"
        label="Your color"
      />,
    );
    expect(screen.getByLabelText('Your color').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getByRole('radio', { name: 'Blue' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Green, selected' })).toBeTruthy();
    expect(screen.getAllByText('L')).toHaveLength(3);
  });

  it('reports the pressed color', async () => {
    const onChange = jest.fn();
    await render(<AvatarPicker colors={colors} value={null} onChange={onChange} initial="" />);
    expect(screen.queryByTestId('avatar-ring')).toBeNull();
    await fireEvent.press(screen.getByRole('radio', { name: 'Gold' }));
    expect(onChange).toHaveBeenCalledWith('gold');
  });

  it('scales the ring in, and under Reduce Motion shows it without scaling', async () => {
    await render(
      <AvatarPicker colors={colors} value="blue" onChange={() => undefined} initial="" />,
    );
    expect(screen.getByTestId('avatar-ring').props.style).toBeDefined();
    await screen.unmount();
    mockReduceMotion = true;
    await render(
      <AvatarPicker colors={colors} value="blue" onChange={() => undefined} initial="" />,
    );
    expect(screen.getByTestId('avatar-ring').props.style).toBeUndefined();
  });
});
