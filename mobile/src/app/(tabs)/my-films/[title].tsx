import { router, useLocalSearchParams } from 'expo-router';

import { FilmSheet } from '@/components/screens/my-films/film-sheet';

export default function MyFilmSheetRoute() {
  const { title } = useLocalSearchParams<{ title: string }>();
  return <FilmSheet titleId={Number(title)} onClose={() => router.back()} />;
}
