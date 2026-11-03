export type Greeting = 'morning' | 'afternoon' | 'evening';

/** Morning from 5:00, afternoon from 12:00, evening from 18:00 until 5:00, on the phone's clock. */
export function greetingFor(date: Date): Greeting {
  const hour = date.getHours();
  if (hour >= 18 || hour < 5) return 'evening';
  if (hour >= 12) return 'afternoon';
  return 'morning';
}
