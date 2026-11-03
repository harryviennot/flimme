import { markLinkReceived } from '@/features/join/link-received';

// Every URL the app is opened with, on a cold start or while it runs. Nothing is rewritten: an
// invite link is only stamped with the moment it arrived, which `join_room` gets as
// `link_opened_at` (join-sheet.md#links).
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  if (/\/join\/\d/.test(path)) markLinkReceived();
  return path;
}
