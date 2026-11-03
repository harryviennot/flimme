import { fireEvent, render, screen } from '@testing-library/react-native';
import { createRef } from 'react';

import { HiddenInput, type HiddenInputHandle } from './hidden-input';

describe('HiddenInput', () => {
  it('reports typed text and keeps its label and value for a screen reader', async () => {
    const onChangeText = jest.fn();
    await render(
      <HiddenInput
        value="48"
        onChangeText={onChangeText}
        accessibilityLabel="Room code"
        accessibilityValueText="4 8"
        maxLength={6}
        keyboardType="number-pad"
      />,
    );
    const input = screen.getByLabelText('Room code');
    expect(input.props.maxLength).toBe(6);
    expect(input.props.keyboardType).toBe('number-pad');
    expect(input.props.accessibilityValue).toEqual({ text: '4 8' });
    await fireEvent.changeText(input, '482');
    expect(onChangeText).toHaveBeenCalledWith('482');
  });

  it('hands out a ref that can focus it', async () => {
    const ref = createRef<HiddenInputHandle>();
    await render(
      <HiddenInput ref={ref} value="" onChangeText={jest.fn()} accessibilityLabel="Room code" />,
    );
    expect(typeof ref.current?.focus).toBe('function');
  });
});
