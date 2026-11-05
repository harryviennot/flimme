import { router } from 'expo-router';

import { MyFilmsScreen } from '@/components/screens/my-films/my-films-screen';

export default function MyFilmsRoute() {
  return (
    <MyFilmsScreen
      onOpenFilm={(titleId) =>
        router.push({ pathname: '/my-films/[title]', params: { title: String(titleId) } })
      }
    />
  );
}
