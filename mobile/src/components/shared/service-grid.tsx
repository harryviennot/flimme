import { useTranslation } from 'react-i18next';
import { useWindowDimensions, View } from 'react-native';

import { ServiceTile } from '@/components/shared/service-tile';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';

export type ServiceGridService = { id: number; name: string; logo?: string };

export type ServiceGridProps = {
  services: ServiceGridService[];
  /** Ids of the selected services. */
  selected: number[];
  onToggle: (id: number) => void;
  /** Shows placeholder tiles instead of the services. */
  loading?: boolean;
};

/** Tiles per row: four, three once text is scaled past 1.3 (the initials and badge need room). */
export function serviceColumns(fontScale: number): number {
  return fontScale > 1.3 ? 3 : 4;
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

/**
 * Square logo tiles, four to a row (three at the largest text sizes), wrapping. A short last
 * row keeps the tiles' width (empty cells fill it). Carries the JustWatch credit, since the
 * logos come from its data. Data comes in through props; nothing is fetched here. Used by host
 * setup, Play alone and the lobby's services sheet.
 */
export function ServiceGrid({ services, selected, onToggle, loading = false }: ServiceGridProps) {
  const { t } = useTranslation();
  const { fontScale } = useWindowDimensions();
  const columns = serviceColumns(fontScale);
  if (loading) {
    return (
      <View className="gap-2" testID="service-grid-loading">
        {[0, 1].map((row) => (
          <View key={row} testID="service-grid-loading-row" className="flex-row gap-2">
            {Array.from({ length: columns }, (_, cell) => (
              <Skeleton key={cell} className="aspect-square flex-1 rounded-md" />
            ))}
          </View>
        ))}
      </View>
    );
  }
  return (
    <View className="gap-2">
      {chunk(services, columns).map((row, index) => (
        <View key={index} className="flex-row gap-2">
          {row.map((service) => (
            <ServiceTile
              key={service.id}
              name={service.name}
              logo={service.logo}
              selected={selected.includes(service.id)}
              onPress={() => onToggle(service.id)}
            />
          ))}
          {Array.from({ length: columns - row.length }, (_, i) => (
            <View key={`pad-${i}`} className="min-w-0 flex-1" />
          ))}
        </View>
      ))}
      <Text variant="body-s" tone="muted">
        {t('card.justwatch')}
      </Text>
    </View>
  );
}
