// The six preset avatars (decisions.md, 30 Oct 2026). The database allows these and
// 'default' (a guest's start), and api.update_profile answers `unknown_avatar` otherwise.
export const AVATAR_KEYS = ['blue', 'green', 'gold', 'red', 'violet', 'teal'] as const;
export type AvatarKey = (typeof AVATAR_KEYS)[number];
