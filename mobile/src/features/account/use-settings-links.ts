import * as Application from 'expo-application';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform } from 'react-native';

import { showToast } from '@/components/ui/toast';
import { useAppConfig } from '@/features/app-config/use-app-config';
import type { Language } from '@/i18n';

import { legalLinks, supportMailto } from './legal';

export type SettingsLinks = {
  /** `loading` until `app_config` has answered once (rows show a skeleton). */
  status: 'loading' | 'ready';
  privacy: string | null;
  terms: string | null;
  supportEmail: string | null;
  openLanguage: () => void;
  openPrivacy: () => void;
  openTerms: () => void;
  contactSupport: () => void;
};

/**
 * What the Settings rows open (settings.md): the phone's language page, the policy and terms in
 * the in-app browser, and a mail to support, or its address copied when there is no mail app.
 */
export function useSettingsLinks(): SettingsLinks {
  const { t, i18n } = useTranslation('settings');
  const config = useAppConfig();
  const language: Language = i18n.language === 'fr' ? 'fr' : 'en';
  const { privacy, terms, supportEmail } = legalLinks(config.data?.legal_urls, language);

  const openLanguage = useCallback(() => {
    void Linking.openSettings().catch(() => {});
  }, []);
  const open = useCallback((url: string | null) => {
    if (url) void WebBrowser.openBrowserAsync(url).catch(() => {});
  }, []);

  const contactSupport = useCallback(() => {
    if (!supportEmail) return;
    const build = [
      t('about.version', {
        version: Application.nativeApplicationVersion ?? '?',
        build: Application.nativeBuildVersion ?? '?',
      }),
      `${Platform.OS === 'ios' ? 'iOS' : 'Android'} ${String(Platform.Version)}`,
    ].join(', ');
    const url = supportMailto({ email: supportEmail, subject: t('support.subject'), build });
    const copy = () => {
      void Clipboard.setStringAsync(supportEmail).catch(() => {});
      showToast({
        tone: 'info',
        title: t('support.copied.title'),
        message: t('support.copied.message', { email: supportEmail }),
      });
    };
    Linking.canOpenURL(url)
      .then((can) => (can ? Linking.openURL(url) : copy()))
      .catch(copy);
  }, [supportEmail, t]);

  return {
    status: config.isPending ? 'loading' : 'ready',
    privacy,
    terms,
    supportEmail,
    openLanguage,
    openPrivacy: () => open(privacy),
    openTerms: () => open(terms),
    contactSupport,
  };
}
