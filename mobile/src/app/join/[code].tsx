import { useLocalSearchParams } from 'expo-router';

import { JoinSheet } from '@/components/screens/join-sheet/join-sheet';
import { useJoinLink } from '@/features/join/use-join-link';

// The invite link's target, a form sheet: joins with the link's code and room reference, asks a
// first-time player for a name, then replaces itself with the room (join-sheet.md).
export default function JoinFromLinkScreen() {
  const params = useLocalSearchParams<{ code: string; r?: string }>();
  const join = useJoinLink(params);
  return (
    <JoinSheet
      view={join.view}
      code={join.code}
      nameError={join.nameError}
      saving={join.saving}
      onClearNameError={join.clearNameError}
      onRetry={join.retry}
      onSubmit={join.submit}
    />
  );
}
