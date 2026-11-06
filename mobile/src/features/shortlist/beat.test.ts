import { haptics } from '@/lib/haptics';
import { playSound } from '@/lib/sound';

import { shortlistBeatFeedback } from './beat';

jest.mock('@/lib/haptics', () => ({ haptics: { shortlist: jest.fn() } }));
jest.mock('@/lib/sound', () => ({ playSound: jest.fn(async () => undefined) }));

describe('the shortlisted beat (sounds.md#a-match-joins-the-shortlist)', () => {
  it('plays the bell with the double tap, once each', () => {
    shortlistBeatFeedback();
    expect(haptics.shortlist).toHaveBeenCalledTimes(1);
    expect(playSound).toHaveBeenCalledTimes(1);
    expect(playSound).toHaveBeenCalledWith('shortlist');
  });
});
