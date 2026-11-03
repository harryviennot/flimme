import { Redirect } from 'expo-router';

import { SplashProblem } from '@/components/screens/splash/splash-problem';
import { SplashView } from '@/components/screens/splash/splash-view';
import { useLaunch } from '@/features/launch/use-launch';

// First launch (roadmap M4.6): the hand-off from the native splash while the guest session and
// the profile load, then always a `replace` to Welcome or Home (splash.md).
export default function Index() {
  const { step, retry } = useLaunch();
  if ('go' in step) return <Redirect href={step.go} />;
  if (step.show === 'offline' || step.show === 'signInFailed') {
    return <SplashProblem kind={step.show} onRetry={retry} />;
  }
  return <SplashView slow={step.show === 'slow'} />;
}
