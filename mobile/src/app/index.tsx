import { Redirect } from 'expo-router';

// First launch decides between Welcome and Home from the profile (roadmap M4.6).
export default function Index() {
  return <Redirect href="/welcome" />;
}
