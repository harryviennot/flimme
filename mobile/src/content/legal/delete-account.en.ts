// The deletion request page in English. M8.3, from docs/product/privacy.md ("Players' rights in
// practice"), docs/architecture/data-model.md#deleting-an-account-exporting-data and
// docs/architecture/security.md (inactive guests). Google Play requires a web page where a player
// can ask for deletion without the app. Shown at https://flimme.com/en/delete-account. Change it
// together with delete-account.fr.ts, and the date.
export const updated = '2026-11-05';

export default `# Delete your account and data

You can ask for your Flimme data to be deleted, with or without the app. Here is what works in each case, with nothing hidden.

## If you still have the app

This is the simplest way, and it is immediate: open Flimme, go to Settings, tap Delete my data, then confirm.

It works for a guest profile too, with no account or email. Your name, services, games, My films and taste profile are erased. Your past votes stay in their rooms, without your name, so other players' games stay correct. If you signed in with Apple, we also revoke the access you gave it.

## If you deleted the app or lost your phone

Flimme doesn't ask for an email or a password. Your guest profile is tied to a random identifier kept on your phone, and nothing else. Without the app, we have no way to know which data is yours. An email address isn't enough to find a guest profile, and we won't guess: we could erase someone else's data.

Here is what happens anyway:

- A guest profile that isn't used for 90 days is deleted automatically, with its data. If you stopped using Flimme, your profile disappears by itself and you don't need to do anything.
- To delete it right now, reinstall Flimme on the same phone: if the profile is still there, Settings gives you Delete my data. Otherwise it can't be reached any more.

## If you saved an account

If you saved your account with Apple or Google, we hold the email address they passed on to us. Write to us from that address and we will delete your account and its data.

[Ask to delete my account](mailto:support@flimme.com?subject=Delete%20my%20Flimme%20account)

In your message, give only the account's email address and, if you remember it, the provider (Apple or Google). Don't send an ID document or a password: we don't need either.

## What we do with your request

- We answer within one month at most (the GDPR rule, article 12(3)).
- We check that the request comes from the account's address, delete the account, and confirm by email.
- Usage statistics and crash reports aren't linked to you, so they hold nothing to delete.

To download your data before deleting it, or for any other question about your rights, write to [support@flimme.com](mailto:support@flimme.com). You can also complain to the CNIL if you think your rights aren't respected. It is all explained in the [privacy policy](https://flimme.com/en/privacy).
`;
