import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import type { TFunction } from 'i18next';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Share } from 'react-native';

import { showToast } from '@/components/ui/toast';
import { useAppConfig } from '@/features/app-config/use-app-config';
import { useRoom } from '@/features/room/queries';
import { track } from '@/lib/analytics';
import { variant } from '@/lib/variant';

/**
 * The invite link. With an `invite_base_url` (`https://flimme.com`, M4.18) it is
 * `<base>/join/<code>?r=<id>`; without one, the build's own scheme
 * (`flimme-dev://join/<code>?r=<id>`). Never logged.
 */
export function inviteLink({
  base,
  scheme,
  code,
  id,
}: {
  base?: string;
  scheme: string;
  code: string;
  id: string;
}): string {
  const path = `join/${code}?r=${id}`;
  return base ? `${base.replace(/\/+$/, '')}/${path}` : `${scheme}://${path}`;
}

/** The link as the sheet shows it: without `https://`, a scheme link whole. */
export function displayLink(link: string): string {
  return link.replace(/^https:\/\//i, '');
}

/** "482913" as "482 913", the way the code is read aloud. */
function spaced(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

export function shareMessage(t: TFunction<'lobby'>, link: string, code: string): string {
  return t('invite.shareMessage', { link, code: spaced(code) });
}

/** The system share sheet with the invite message. */
export async function shareInvite({
  link,
  code,
  t,
}: {
  link: string;
  code: string;
  t: TFunction<'lobby'>;
}): Promise<boolean> {
  const result = await Share.share({ message: shareMessage(t, link, code) });
  // Closing the sheet without picking anything shares nothing.
  return result.action === Share.sharedAction;
}

/** The build's own scheme (`flimme-dev`, `flimme-preview`, `flimme`). */
function buildScheme(): string {
  const scheme = Constants.expoConfig?.scheme;
  return (Array.isArray(scheme) ? scheme[0] : scheme) ?? 'flimme';
}

export type Invite = {
  state: 'loading' | 'error' | 'ready';
  link?: string;
  code?: string;
  share: () => Promise<void>;
  copy: () => Promise<void>;
  retry: () => void;
};

/** The invite for a room: loading until `app_config` and the room are known. */
export function useInvite(roomId: string | undefined): Invite {
  const { t } = useTranslation('lobby');
  const room = useRoom(roomId);
  const config = useAppConfig();

  const code = room.data?.code;
  const id = room.data?.id ?? roomId;
  // Only preview and production builds claim the domain's links (app.config.ts), so a
  // development build shares its own scheme even when its database has the base (Q14.5).
  const base = variant() === 'development' ? undefined : config.data?.invite_base_url;
  const link =
    code && id && config.isSuccess
      ? inviteLink({ base, scheme: buildScheme(), code, id })
      : undefined;

  const state: Invite['state'] = link ? 'ready' : config.isError ? 'error' : 'loading';

  const share = useCallback(async () => {
    if (!link || !code) return;
    if (await shareInvite({ link, code, t })) track('room:invite_share', { method: 'share_sheet' });
  }, [link, code, t]);

  const copy = useCallback(async () => {
    if (!link) return;
    await Clipboard.setStringAsync(link);
    track('room:invite_share', { method: 'code_copy' });
    showToast({ title: t('invite.copied'), tone: 'info' });
  }, [link, t]);

  const { refetch } = config;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  return { state, link, code, share, copy, retry };
}
