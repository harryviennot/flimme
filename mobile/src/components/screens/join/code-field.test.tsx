import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import i18n from '@/i18n';

import { PinBox } from '@/components/ui/pin-box';

import { CodeField } from './code-field';

let mockReduce = false;
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return new Proxy(actual, {
    get: (target, key) => (key === 'useReducedMotion' ? () => mockReduce : target[key]),
  });
});

function Harness({ shaking = false, onShakeEnd = jest.fn(), initial = '' }) {
  const [code, setCode] = useState(initial);
  return (
    <CodeField
      code={code}
      onChangeCode={setCode}
      error={shaking}
      shaking={shaking}
      onShakeEnd={onShakeEnd}
    />
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('fr');
  mockReduce = false;
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

describe('CodeField', () => {
  it('is one accessible input that reads its progress', async () => {
    await render(<Harness initial="48" />);
    const input = screen.getByLabelText('Code de la salle, 6 chiffres');
    expect(input.props.accessibilityValue).toEqual({ text: '4 8, 2 chiffres sur 6' });
    await fireEvent.changeText(input, '482');
    expect(screen.getByLabelText('Code de la salle, 6 chiffres').props.accessibilityValue).toEqual({
      text: '4 8 2, 3 chiffres sur 6',
    });
  });

  it('uses the number pad and takes six digits', async () => {
    await render(<Harness />);
    const input = screen.getByLabelText('Code de la salle, 6 chiffres');
    expect(input.props.keyboardType).toBe('number-pad');
    expect(input.props.maxLength).toBe(6);
  });

  it('ends the shake after 320 ms', async () => {
    const onShakeEnd = jest.fn();
    await render(<Harness shaking onShakeEnd={onShakeEnd} initial="482913" />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(300);
    });
    expect(onShakeEnd).not.toHaveBeenCalled();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(40);
    });
    expect(onShakeEnd).toHaveBeenCalledTimes(1);
  });

  it('skips the shake under Reduce Motion', async () => {
    mockReduce = true;
    const onShakeEnd = jest.fn();
    await render(<Harness shaking onShakeEnd={onShakeEnd} initial="482913" />);
    expect(onShakeEnd).toHaveBeenCalled();
  });
});

describe('PinBox error', () => {
  it('renders in the error state', async () => {
    await render(<PinBox digit="4" error />);
    expect(screen.getByText('4')).toBeTruthy();
  });
});
