import { Redirect } from 'expo-router';

// Home is Play now (tab-bar.md). A stale navigation to `/home` still lands somewhere real.
export default function Home() {
  return <Redirect href="/play" />;
}
