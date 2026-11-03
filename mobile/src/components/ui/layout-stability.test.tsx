import { render, screen } from '@testing-library/react-native';

import { tokens } from '@/theme/generated/tokens';

import { Button } from './button';
import { Input } from './input';
import { OptionCard } from './option-card';

// The class strings are what the layout is made of: selecting, focusing or disabling must
// never change a component's size, so a 1-point border is paired with 1 more point of padding.

function classOf(node: { props: { className?: string } } | null | undefined) {
  return node?.props.className ?? '';
}

describe('layout never depends on state', () => {
  it('option card: 1-point border with padding 4.25, 2-point border with padding 4', async () => {
    await render(
      <>
        <OptionCard title="Quick" description="d" icon="zap" />
        <OptionCard title="Final" description="d" icon="zap" selected />
      </>,
    );
    const idle = classOf(screen.getByRole('radio', { name: 'Quick' }));
    const selected = classOf(screen.getByRole('radio', { name: 'Final' }));
    expect(idle).toMatch(/\bborder\b.*\bp-4\.25\b/);
    expect(selected).toMatch(/\bborder-2\b.*\bp-4\b/);
  });

  it('input: the idle side padding is 1 point wider than the error one', async () => {
    await render(
      <>
        <Input label="Idle" value="" onChangeText={() => {}} />
        <Input label="Wrong" value="" error="No" onChangeText={() => {}} />
      </>,
    );
    expect(classOf(screen.getByLabelText('Idle').parent)).toContain('px-4.25');
    expect(classOf(screen.getByLabelText('Wrong').parent)).toContain('border-2');
    expect(classOf(screen.getByLabelText('Wrong').parent)).toContain('px-4');
  });

  it('input text has no line height, which pushes single-line iOS text down', () => {
    expect(tokens.typography.input).not.toHaveProperty('lineHeight');
    expect(tokens.typography.input.fontSize).toBe(tokens.typography['body-l'].fontSize);
  });

  it('a disabled button keeps the space of its lip', async () => {
    await render(
      <>
        <Button label="On" />
        <Button label="Off" disabled />
        <Button label="Ghost" variant="ghost" />
      </>,
    );
    expect(classOf(screen.getByRole('button', { name: 'On' }))).toContain('pb-1');
    expect(classOf(screen.getByRole('button', { name: 'Off' }))).toContain('pb-1');
    expect(classOf(screen.getByRole('button', { name: 'Ghost' }))).not.toContain('pb-1');
  });
});
