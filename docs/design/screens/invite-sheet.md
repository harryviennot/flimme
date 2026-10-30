# Invite sheet

Screen 09 in the Figma (`15:722`). Route `/room/[id]/invite`, a `formSheet` at 80% height over the [lobby](lobby.md) (already set in the room layout). Built in M4.12, with the domain from M0.2. Written on 30 October 2026 from [the link](../../product/onboarding.md#the-link), [hosting](../../product/onboarding.md#hosting) and [invites and deep links](../../architecture/app-structure.md#invites-and-deep-links).

## Purpose

Get friends in: a QR code to scan with their camera across the couch, the link to send to the others, and the system share sheet. The room code stays readable behind the sheet.

## Layout

1. The system grabber; `IconButton` plain `x` at the top right (`common:actions.close`).
2. **Title**, `display-s`, centred, `lobby:invite.title`.
3. **QR panel** (`screens/invite/qr-panel.tsx`): the link drawn with `react-native-qrcode-svg` at 180 points (`size-45`), modules in `text.inverse` on a `text.primary` square with `p-4` and `rounded-lg`, wrapped in `glow-accent`.
4. **Link row:** `bg-bg-raised`, `rounded-md`, `p-4`: the link without `https://` in `mono-data` tone `accent`, cut in the middle if it's too long, and `IconButton` plain `copy`. Copying shows `showToast` info `lobby:invite.copied`.
5. **Helper**, `body-s` tone `muted`, centred: `lobby:invite.helper`.
6. **`Button` primary L**, icon `share`, `lobby:invite.share`: the system share sheet with `lobby:invite.shareMessage`.

The link is `invite_base_url` from `api.app_config`, then `/join/<code>?r=<room ref>` (M4.1).

## When it opens

- By itself for the host, once, right after **Open the room** ([host setup](host-setup.md)). Their first job is inviting.
- From the lobby's share icon and **Show QR**. (**Share link** in the lobby shares directly, without the sheet.)

## States

| State | What the sheet shows |
| --- | --- |
| The link isn't known yet (`app_config` loading) | `Skeleton` in the QR's place and the link row's; copy and share disabled |
| `app_config` failed | `EmptyState` `error` in the QR's place, `lobby:invite.error`, `common:actions.retry` |
| Offline | Everything still works: the QR and the link are drawn on the phone, and the share sheet queues the message |

## Copy (`lobby` namespace)

| Key | French | English |
| --- | --- | --- |
| `invite.title` | Invite tes amis | Invite friends |
| `invite.helper` | Toute personne avec le lien peut rejoindre cette salle. | Anyone with the link can join this room. |
| `invite.copy` | Copier le lien | Copy the link |
| `invite.copied` | Lien copié | Link copied |
| `invite.share` | Partager l'invitation | Share invite |
| `invite.shareMessage` | Rejoins ma salle : {{link}} (code {{code}}) | Join my room: {{link}} (code {{code}}) |
| `invite.qr` | QR code de l'invitation. Tes amis le scannent avec leur appareil photo. | Invite QR code. Friends scan it with their camera. |
| `invite.link` | Lien d'invitation | Invite link |
| `invite.error` | Impossible de préparer le lien. | We couldn't get the link ready. |

In the share message the code has a space in the middle ("482 913").

## Motion, haptics, sound

- The system's sheet motion; the QR comes in with `layout.fadeIn` once the link is known.
- Copy and Share press with `haptics.press()` (`Pressable`); the copied toast with `layout.toastIn`.

## Accessibility

- Focus goes to the title. Order: title, the QR (an image labelled `lobby:invite.qr`), the link (`lobby:invite.link`, then the link), copy (`lobby:invite.copy`), the helper, Share invite, close.
- The sheet closes with the system's escape gesture as well as the grabber and the close button.
- Reduce Motion: the QR is simply there.

## Differences from the Figma

- The link becomes `/join/<code>?r=...` instead of `/j/<code>`, on the invite domain (M0.2) instead of moviematch.app.
- The helper drops "It closes 20 minutes after the last swipe": no such rule exists ([what onboarding needs elsewhere](../../product/onboarding.md#what-this-needs-elsewhere)).
- A close button for screen readers; the Figma has the grabber only.
- The lobby behind the sheet has no sliders action in this release ([host setup](host-setup.md#questions)).

## Questions

Harry accepted every default below on 30 October 2026.

1. **Screen brightness.** Raising the brightness while the sheet is open would help a QR scanned across a dim room. Default: no (one more dependency); revisit after the first group test.
2. **The share message.** Default: the copy above, which is the app structure's English; the French is new.
