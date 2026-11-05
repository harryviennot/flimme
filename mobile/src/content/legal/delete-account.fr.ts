// La page de demande de suppression, en français. M8.3, d'après docs/product/privacy.md
// (« Players' rights in practice »), docs/architecture/data-model.md#deleting-an-account-exporting-data
// et docs/architecture/security.md (invités inactifs). Google Play exige une page web où demander
// la suppression sans l'appli. Affichée sur https://flimme.com/fr/suppression. À changer avec
// delete-account.en.ts, et la date.
export const updated = '2026-11-05';

export default `# Supprimer mon compte et mes données

Tu peux demander la suppression de tes données Flimme, avec ou sans l'appli. Voici ce qui marche dans chaque cas, sans rien te cacher.

## Si tu as encore l'appli

C'est le plus simple, et c'est immédiat : ouvre Flimme, va dans Réglages, touche Supprimer mes données, puis confirme.

Cela marche aussi pour un profil invité, sans compte ni e-mail. Ton prénom, tes plateformes, tes parties, Mes films et ton profil de goûts sont effacés. Tes votes passés restent dans leurs salles, sans ton prénom, pour que les parties des autres joueurs restent justes. Si tu t'étais connecté avec Apple, nous révoquons aussi l'accès que tu lui avais donné.

## Si tu as supprimé l'appli ou perdu ton téléphone

Flimme ne te demande ni e-mail ni mot de passe. Ton profil invité n'est donc relié qu'à un identifiant aléatoire, gardé sur ton téléphone. Sans l'appli, nous n'avons aucun moyen de savoir quelles données sont les tiennes. Un e-mail ne suffit pas à retrouver un profil invité, et nous ne voulons pas deviner : nous pourrions effacer les données de quelqu'un d'autre.

Voici ce qui se passe quand même :

- Un profil invité qui n'est pas utilisé pendant 90 jours est supprimé automatiquement, avec ses données. Si tu as quitté Flimme, ton profil disparaît donc tout seul, sans que tu aies rien à faire.
- Une fois l'appli supprimée, ou le téléphone perdu, l'ancien profil n'est plus joignable, ni depuis un autre téléphone ni en réinstallant l'appli : Flimme te crée alors un nouveau profil invité, vide. La suppression automatique au bout de 90 jours est donc la seule voie.

## Si tu as enregistré un compte

Si tu as enregistré ton compte avec Apple ou Google, nous avons l'adresse e-mail qu'ils nous ont transmise. Écris-nous depuis cette adresse, et nous supprimerons ton compte et ses données.

[Demander la suppression de mon compte](mailto:support@flimme.com?subject=Suppression%20de%20mon%20compte%20Flimme)

Dans ton message, indique seulement l'adresse e-mail du compte et, si tu t'en souviens, la plateforme (Apple ou Google). Ne nous envoie ni pièce d'identité ni mot de passe : nous n'en avons pas besoin.

## Ce que nous faisons de ta demande

- Nous répondons dans un délai d'un mois au plus (c'est la règle du RGPD, article 12.3).
- Nous vérifions que la demande vient de l'adresse du compte, nous supprimons le compte, et nous te le confirmons par e-mail.
- Les rapports de plantage ne portent aucun identifiant de joueur. Les statistiques d'usage sont aussi effacées de l'outil de mesure quand tu supprimes ton compte dans l'appli.

Pour télécharger tes données avant de les supprimer, ou pour toute autre question sur tes droits, écris à [support@flimme.com](mailto:support@flimme.com). Tu peux aussi saisir la CNIL si tu penses que tes droits ne sont pas respectés. Tout est expliqué dans la [politique de confidentialité](https://flimme.com/fr/confidentialite).
`;
