import { greetingFor } from './greeting';

const at = (hour: number, minute: number) => new Date(2026, 10, 3, hour, minute);

describe('greetingFor', () => {
  it.each([
    [4, 59, 'evening'],
    [5, 0, 'morning'],
    [11, 59, 'morning'],
    [12, 0, 'afternoon'],
    [17, 59, 'afternoon'],
    [18, 0, 'evening'],
    [0, 0, 'evening'],
  ] as const)('at %i:%i it is %s', (hour, minute, expected) => {
    expect(greetingFor(at(hour, minute))).toBe(expected);
  });
});
