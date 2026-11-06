import { gridServices } from './grid-services';

const listed = [
  { provider_id: 8, name: 'Netflix', logo_path: '/n.jpg', display_priority: 1 },
  { provider_id: 119, name: 'Prime Video', logo_path: null, display_priority: 2 },
];

describe('gridServices', () => {
  it('builds each logo from the image base at w92, and leaves it out without a path or base', () => {
    expect(gridServices(listed, 'https://img.test/t/p/')).toEqual([
      { id: 8, name: 'Netflix', logo: 'https://img.test/t/p/w92/n.jpg' },
      { id: 119, name: 'Prime Video', logo: undefined },
    ]);
    expect(gridServices(listed, undefined)[0]?.logo).toBeUndefined();
  });
});
