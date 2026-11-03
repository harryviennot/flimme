import { InvitePage } from '@/components/screens/invite-page/invite-page';
import { useCurrentLink } from '@/components/screens/invite-page/use-current-link';

// The invite link in a browser (roadmap M4.14): the room code and the steps. The native route is
// `[code].tsx`. No API is called.
export default function InviteRoute() {
  return <InvitePage link={useCurrentLink()} />;
}
