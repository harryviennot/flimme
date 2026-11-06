// Service logos come from the TMDB image base at w92, the size the card back and the winner
// screen use (tmdb.md, "Images").
const LOGO_SIZE = 'w92';

type Listed = { provider_id: number; name: string; logo_path: string | null };
export type GridService = { id: number; name: string; logo?: string };

/** The country's services as the picker's tiles, with each logo's full address when it has one. */
export function gridServices(
  listed: readonly Listed[],
  imageBase: string | undefined,
): GridService[] {
  const base = imageBase?.replace(/\/+$/, '');
  return listed.map((p) => ({
    id: p.provider_id,
    name: p.name,
    logo:
      base && p.logo_path ? `${base}/${LOGO_SIZE}/${p.logo_path.replace(/^\/+/, '')}` : undefined,
  }));
}
