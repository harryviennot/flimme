import type { Card } from '@flimme/contract';

import { serviceLogos, servicesLabel } from './services';

type Offer = Card['providers'][number];
const offer = (provider_id: number, name: string, kind: Offer['kind'], logo_path: string | null) =>
  ({ provider_id, name, kind, logo_path }) as Offer;

const BASE = 'https://image.tmdb.org/t/p';

describe('serviceLogos', () => {
  it('lists each service once, whatever its offer kinds, in the card order', () => {
    const logos = serviceLogos(
      [
        offer(8, 'Netflix', 'subscription', '/n.jpg'),
        offer(381, 'Canal+', 'subscription', '/c.jpg'),
        offer(8, 'Netflix', 'ads', '/n.jpg'),
        offer(2, 'Apple TV', 'rent', null),
      ],
      BASE,
    );
    expect(logos.map((l) => l.name)).toEqual(['Netflix', 'Canal+', 'Apple TV']);
  });

  it('builds the logo from the image base at w92, and leaves it out without a path or base', () => {
    const [a, b] = serviceLogos(
      [offer(8, 'Netflix', 'subscription', '/n.jpg'), offer(2, 'Apple TV', 'rent', null)],
      `${BASE}/`,
    );
    expect(a?.logo).toBe(`${BASE}/w92/n.jpg`);
    expect(b?.logo).toBeUndefined();
    expect(serviceLogos([offer(8, 'Netflix', 'free', '/n.jpg')], undefined)[0]?.logo).toBe(
      undefined,
    );
  });

  it('is empty for a film with no service left', () => {
    expect(serviceLogos([], BASE)).toEqual([]);
  });
});

describe('servicesLabel', () => {
  it('joins the names in the language', () => {
    const logos = serviceLogos(
      [offer(8, 'Netflix', 'subscription', null), offer(381, 'Canal+', 'free', null)],
      BASE,
    );
    expect(servicesLabel(logos, 'en')).toBe('Netflix and Canal+');
    expect(servicesLabel(logos, 'fr')).toBe('Netflix et Canal+');
  });
});
