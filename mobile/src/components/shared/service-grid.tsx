import { View } from 'react-native';

import { ServiceTile } from '@/components/shared/service-tile';
import { Skeleton } from '@/components/ui/skeleton';

export type ServiceGridService = { id: number; name: string };

export type ServiceGridProps = {
  services: ServiceGridService[];
  /** Ids of the selected services. */
  selected: number[];
  onToggle: (id: number) => void;
  /** Shows six placeholder tiles instead of the services. */
  loading?: boolean;
};

const COLUMNS = 3;

function chunk<T>(items: T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += COLUMNS) rows.push(items.slice(i, i + COLUMNS));
  return rows;
}

/**
 * Service tiles in rows of three, wrapping. A short last row keeps the tiles' width (empty
 * cells fill it). Data comes in through props; nothing is fetched here. Used by host setup and
 * the lobby's services sheet.
 */
export function ServiceGrid({ services, selected, onToggle, loading = false }: ServiceGridProps) {
  if (loading) {
    // A tile is 68 points high: 12 of border and padding, title-m 22, gap 4, body-s 18, 12.
    return (
      <View className="gap-2" testID="service-grid-loading">
        {[0, 1].map((row) => (
          <View key={row} testID="service-grid-loading-row" className="flex-row gap-2">
            {[0, 1, 2].map((cell) => (
              <Skeleton key={cell} className="h-17 flex-1 rounded-md" />
            ))}
          </View>
        ))}
      </View>
    );
  }
  return (
    <View className="gap-2">
      {chunk(services).map((row, index) => (
        <View key={index} className="flex-row gap-2">
          {row.map((service) => (
            <ServiceTile
              key={service.id}
              name={service.name}
              selected={selected.includes(service.id)}
              onPress={() => onToggle(service.id)}
            />
          ))}
          {Array.from({ length: COLUMNS - row.length }, (_, i) => (
            <View key={`pad-${i}`} className="min-w-0 flex-1" />
          ))}
        </View>
      ))}
    </View>
  );
}
