import { useAppConfig } from '@/features/app-config/use-app-config';

import { type GridService, gridServices } from './grid-services';

/** `gridServices` with the image base from `app_config`. */
export function useGridServices(
  listed: readonly { provider_id: number; name: string; logo_path: string | null }[],
): GridService[] {
  const imageBase = useAppConfig().data?.tmdb_image_base;
  return gridServices(listed, imageBase);
}
