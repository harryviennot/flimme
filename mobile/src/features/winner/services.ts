import type { Card } from '@flimme/contract';

import { formatList } from '@/features/lobby/names';

// The room's services that have the pick (winner.md, Q16.3): one logo per `provider_id`
// whatever its offer kinds, in the card's order. Logos come from the TMDB image base at w92,
// the size the card back uses.

const LOGO_SIZE = 'w92';

export type ServiceLogo = { id: number; name: string; logo?: string };

export function serviceLogos(
  providers: Card['providers'],
  imageBase: string | undefined,
): ServiceLogo[] {
  const base = imageBase?.replace(/\/+$/, '');
  const list: ServiceLogo[] = [];
  for (const offer of providers) {
    if (list.some((service) => service.id === offer.provider_id)) continue;
    list.push({
      id: offer.provider_id,
      name: offer.name,
      logo:
        base && offer.logo_path
          ? `${base}/${LOGO_SIZE}/${offer.logo_path.replace(/^\/+/, '')}`
          : undefined,
    });
  }
  return list;
}

/** "Netflix and Canal+", for the logos' one accessibility label. */
export function servicesLabel(services: readonly ServiceLogo[], language: string): string {
  return formatList(
    services.map((service) => service.name),
    language,
  );
}
