import { serviceInitials } from './service-initials';

describe('serviceInitials', () => {
  it('takes the first letter of up to two words, in capitals', () => {
    expect(serviceInitials('Prime Video')).toBe('PV');
    expect(serviceInitials('Apple TV+ Amazon Channel')).toBe('AT');
    expect(serviceInitials('canal+')).toBe('C');
    expect(serviceInitials('  ')).toBe('?');
  });
});
