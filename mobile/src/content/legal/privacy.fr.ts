// The privacy policy, in French (the primary text). Written from docs/product/privacy.md
// (outline and data map) and checked against the code of the first release. A Markdown string
// in the small subset legal.test.ts allows, so the website (M8.3) can render it simply.
// The English version (privacy.en.ts) says the same thing.

export const updated = '2026-11-06';

export default `# Politique de confidentialité de Flimme

Flimme t'aide à choisir un film entre amis, ou seul. Cette page explique quelles données l'appli utilise, pourquoi, et comment tu gardes la main dessus. Elle décrit la version actuelle de l'appli, pas ce qui viendra plus tard.

## En bref

- Pas de compte : tu joues avec un prénom et une couleur, sans e-mail ni mot de passe.
- Pas de publicité, pas de pistage d'une appli à l'autre, aucune donnée vendue.
- Ton profil et tes parties sont stockés dans l'Union européenne, à Francfort.
- Les statistiques d'usage sont anonymes en Europe, et tu peux les couper dans les Réglages.
- Tu peux télécharger ou supprimer tes données depuis l'appli, à tout moment.

## 1. Qui sommes-nous

Flimme est édité par Harry Viennot, développeur indépendant, à titre personnel. C'est lui le responsable du traitement de tes données.

Pour toute question sur tes données, ou pour exercer tes droits, écris à [support@flimme.com](mailto:support@flimme.com).

## 2. Ce que nous collectons

Tu n'as pas de compte à créer. À la première ouverture, l'appli crée un profil sur nos serveurs, sans e-mail. Voici ce que nous gardons.

| Données | Ce que c'est |
| --- | --- |
| Ton profil | Un identifiant aléatoire, le prénom ou le pseudo que tu choisis, ta couleur (choisie dans une liste, jamais une photo), ta langue et le pays réglé sur ton téléphone |
| Ta connexion | La date de création de ton profil et de ton dernier passage. Pour chaque session, notre base de données enregistre aussi l'adresse IP de ton téléphone et l'identification technique de l'appli |
| Le journal des connexions | Pour la sécurité, Supabase, qui gère la connexion, note chaque connexion, chaque renouvellement de ta session et la suppression de ton profil : l'action, ton identifiant et l'heure. Selon l'action, il peut aussi noter l'adresse IP de ton téléphone |
| Tes plateformes | Les services de streaming que tu as |
| Tes parties | Les salles que tu crées ou rejoins et leurs réglages. Ta place dans chaque salle : ton prénom, ta couleur et tes plateformes ce soir-là, et comment tu es arrivé (lien, code, QR code). Tes réponses à chaque film (J'aime, Bof, Coup de cœur, Déjà vu) et leur heure, tes votes au Final Cut et le film du soir. Une partie en solo est une salle à une seule place |
| Le journal des cartes | Pour chaque carte : le film, comment il est arrivé dans ton paquet, sa place, son score et ce qui a servi à le choisir, ta réponse et son heure, une annulation éventuelle, si tu as retourné la carte et le temps passé dessus. Il est relié à ta place dans la salle, jamais à ton prénom |
| Mes films | Les films que tu as aimés et quand, tes coups de cœur, les films choisis avec ton groupe, et ceux que tu as marqués comme déjà vus |
| Ton choix sur les statistiques | Ta réponse au réglage « Aider à améliorer l'appli » (activé, désactivé ou stats détaillées), sa date et la version du texte affiché |
| Les signalements | Si tu signales un joueur : quelle place a signalé quelle place, dans quelle salle, le motif choisi dans une liste (prénom choquant, spam ou sabotage, autre chose) et la date. Jamais de texte libre |
| Les limites anti-abus | Des compteurs par action, liés à ton profil, qui limitent les appels répétés : rejoindre une salle, voir l'aperçu d'une salle, lancer une partie en solo, afficher la carte d'un film en dehors du paquet (par exemple un match ou un film de Mes films), modifier Mes films, changer ton choix sur les statistiques, signaler un joueur et télécharger tes données. Pour rejoindre une salle et voir son aperçu, d'autres compteurs sont liés à ton adresse IP, enregistrée sous forme d'empreinte (hachée), pour empêcher de deviner les codes de salle |
| Les statistiques d'usage | Voir le point 6 |
| Les rapports de plantage | Voir le point 6 |
| Les journaux techniques | Les requêtes reçues par notre base de données, avec l'adresse IP, pour la sécurité et le bon fonctionnement. Les journaux de notre serveur ne contiennent que des identifiants, jamais ton prénom, un code de salle ou ton adresse IP |
| Sur ton téléphone | Ta session (chiffrée), les votes pas encore envoyés, les cartes de la prochaine partie, tes réglages et l'identifiant anonyme des statistiques. Ces données restent sur ton téléphone |

L'appli ne demande jamais d'e-mail, de mot de passe ou de date de naissance. Elle n'accède ni à ta position, ni à tes contacts, ni à ton appareil photo, ni à ton micro, ni à tes photos.

Cette version ne propose ni compte Apple ou Google, ni connexion à Letterboxd, ni notifications. S'ils arrivent, cette politique sera mise à jour avant.

## 3. Pourquoi, et sur quelle base légale

| Pourquoi | Base légale |
| --- | --- |
| Faire tourner le jeu : créer les salles, servir des films disponibles sur vos plateformes, compter les votes, trouver le film du soir, jouer seul | L'exécution du service que tu demandes (contrat) |
| Mes films, et écarter des prochains paquets les films que tu as déjà vus | Contrat |
| Améliorer les paquets : voir quelles cartes plaisent, comparer des façons de construire le paquet, et limiter le solo à 100 cartes par jour | Notre intérêt légitime |
| Protéger les joueurs et le service : signalements, limites anti-abus, journal des connexions, journaux techniques | Notre intérêt légitime (sécurité, règles des stores d'applis) |
| Corriger les plantages | Notre intérêt légitime |
| Mesurer l'audience de l'appli, de façon anonyme | Mesure d'audience exemptée de consentement, selon les conditions de la CNIL, avec la possibilité de la refuser |
| Les stats détaillées, si tu les actives | Ton consentement |
| Les statistiques liées à ton profil, hors d'Europe | Notre intérêt légitime, avec la possibilité de les refuser |
| Garder une trace de ton choix sur les statistiques | Notre obligation de prouver ce que tu as accepté |

Ce que l'appli garde sur ton téléphone (ta session, les votes en attente) est strictement nécessaire au service.

Les films qu'on regarde peuvent en dire beaucoup sur soi. Nous n'en tirons aucune conclusion sur ta vie privée, nous ne les montrons à personne en dehors de ce que décrit le point 5, et nous ne les utilisons jamais pour de la publicité.

## 4. Letterboxd

La connexion à Letterboxd n'est pas proposée dans cette version. L'appli ne lit aucune donnée Letterboxd.

## 5. Ce que voient les autres joueurs

Dans une salle, les autres joueurs voient :

- ton prénom et ta couleur ;
- tes plateformes ;
- ta progression pendant la partie (par exemple « Sam a fini ») ;
- si tu as validé ton vote au Final Cut, mais pas ce que tu as voté ;
- pendant la partie, des compteurs pour la salle, par exemple « 2 sur 3 ont aimé », jamais qui a aimé ;
- après le film du soir, qui a aimé les autres films en lice.

Ils ne voient jamais qui a dit Bof à un film, tes réponses pendant la partie, Mes films, tes parties en solo ou tes parties avec d'autres personnes. Une partie en solo n'est visible que par toi. Il n'y a pas de messagerie entre joueurs.

Si tu signales un joueur, il ne sait jamais qui l'a signalé. Seul Harry lit les signalements. L'hôte peut aussi retirer un joueur de la salle.

## 6. Statistiques et rapports de plantage

### Statistiques d'usage

Pour voir ce qui coince dans l'appli, nous mesurons les écrans ouverts, quelques actions (créer une salle, partager une invitation, rejoindre une salle), des durées et les écrans d'erreur. Avec ces mesures partent ta langue, ton pays, une tranche du nombre de parties jouées (0, 1, 2 à 4, 5 ou plus), le modèle et le système de ton téléphone, la version de l'appli et ton fuseau horaire. Jamais tes votes, tes films, ton prénom, un code de salle ou ton adresse IP.

- **Dans l'Espace économique européen, au Royaume-Uni et en Suisse**, les statistiques sont anonymes : elles portent un identifiant aléatoire, gardé sur ton téléphone, remplacé tous les 13 mois et jamais relié à ton profil. C'est la mesure d'audience que la CNIL dispense de consentement.
- **Si tu actives « Stats détaillées »**, les statistiques sont reliées à l'identifiant de ton profil, à partir de ce moment. Tu peux les couper quand tu veux.
- **Ailleurs**, elles sont reliées à l'identifiant de ton profil, sauf si tu les coupes.
- **Pour savoir où tu es**, l'appli regarde la région réglée sur ton téléphone et le pays de ton profil. Si l'un des deux est en Europe ou inconnu, la règle européenne s'applique.
- **Dans une salle limitée aux films pour moins de 13 ans**, aucun téléphone n'envoie de statistiques.
- **Pour tout couper**, va dans Réglages et désactive « Aider à améliorer l'appli ».

### Rapports de plantage

Quand l'appli ou notre serveur plante, un rapport technique part : l'erreur, l'endroit du code où elle s'est produite, le modèle et le système du téléphone, la version de l'appli. Il ne contient ni ton prénom, ni un code de salle, ni un e-mail, ni ton adresse IP, ni rien qui le relie à ton profil.

## 7. Comment tes parties améliorent l'appli

Cette version n'entraîne aucun modèle d'intelligence artificielle sur tes parties.

Le journal des cartes (point 2) nous sert à voir quelles cartes plaisent et à comparer des façons de construire le paquet, pour que les prochains soient meilleurs. Il est relié à ta place dans la salle, jamais à ton prénom, et il n'est montré à personne.

Tu peux t'y opposer en écrivant à [support@flimme.com](mailto:support@flimme.com), ou en supprimant tes données dans les Réglages : le journal n'est alors plus relié à personne.

## 8. Qui traite tes données pour nous, et où

Ces prestataires traitent tes données pour notre compte, selon nos instructions et un contrat de traitement des données.

| Prestataire | Ce qu'il fait | Où |
| --- | --- | --- |
| Supabase | Base de données, connexion et temps réel pendant les parties | Francfort (Union européenne) |
| Fly.io | Notre serveur : suppression des données, catalogue de films, statistiques des parties | Francfort (Union européenne) |
| Tigris | Stockage de la sauvegarde hebdomadaire, chiffrée | Francfort (Union européenne) |
| GitHub | Fabrique la sauvegarde hebdomadaire et la chiffre avant de l'envoyer au stockage | États-Unis |
| Sentry | Rapports de plantage | Francfort (Union européenne). Sentry indique que certains types de données peuvent être stockés aux États-Unis |
| PostHog | Statistiques d'usage | Francfort (Union européenne) |
| Expo | Mises à jour de l'appli. Quand l'appli en cherche une, Expo reçoit le système de ton téléphone, un identifiant aléatoire et ton adresse IP | États-Unis |
| OVH | Le serveur de notre site, flimme.com, et la boîte e-mail de support@flimme.com : il reçoit et garde les e-mails que tu nous envoies | France (le serveur du site est à Gravelines) |

À part OVH, qui est une entreprise française, ces prestataires sont des entreprises américaines. Quand des données sont envoyées aux États-Unis ou peuvent y être consultées, le transfert est encadré par les clauses contractuelles types de la Commission européenne et, pour les entreprises qui y adhèrent, par le cadre de protection des données UE-États-Unis (Data Privacy Framework).

Certaines versions de test, qui ne sont pas celles publiées dans les stores, utilisent des serveurs séparés : la base de données en Irlande (Union européenne) et le serveur à Londres (Royaume-Uni, que la Commission européenne reconnaît comme offrant une protection adéquate).

Les affiches et les logos des plateformes viennent des serveurs d'images de TMDB. Comme n'importe quel site, ils voient l'adresse IP de ton téléphone quand il télécharge une image. Nous n'envoyons à TMDB aucune donnée sur toi.

La bande-annonce s'ouvre sur YouTube, et « où regarder » ouvre une page de TMDB (avec les données de JustWatch). Une fois chez eux, c'est leur politique de confidentialité qui s'applique. Apple et Google distribuent l'appli selon leurs propres règles ; nous ne leur envoyons aucune donnée de jeu.

Notre site, flimme.com, ne mesure pas l'audience et ne garde aucun journal des visites.

## 9. Combien de temps nous gardons tes données

| Données | Durée |
| --- | --- |
| Profil, plateformes, Mes films, choix sur les statistiques | Tant que tu gardes ton profil. Il est supprimé quand tu supprimes tes données, ou après 90 jours sans activité. Dans ce second cas, les statistiques reliées à ton profil, s'il y en a, ne sont pas effacées tout de suite : elles disparaissent au bout de 25 mois au plus |
| Session de connexion, adresse IP comprise | Jusqu'à la fin de la session, au plus tard jusqu'à la suppression de ton profil |
| Tes parties (places, réponses, votes) | Tant que ton profil existe. Ensuite, tes places restent dans leurs salles sans ton prénom ni ta couleur, et ne sont plus reliées à toi : elles comptent dans les parties des autres. Une salle où la partie n'a jamais commencé est effacée une semaine après |
| Journal des cartes | 13 mois |
| Signalements | 12 mois, même si un des joueurs supprime ses données |
| Limites anti-abus | 1 jour |
| Journal des connexions | 90 jours au plus, même après la suppression de ton profil |
| Journaux techniques | 7 jours au plus |
| Rapports de plantage | 90 jours au plus |
| Statistiques d'usage | 25 mois au plus. L'identifiant anonyme est remplacé tous les 13 mois |
| E-mails que tu nous envoies | Le temps de te répondre, puis 12 mois au plus après le dernier échange |
| Sauvegardes | Les copies quotidiennes, 7 jours au plus. La copie hebdomadaire chiffrée, 4 semaines. Les données supprimées disparaissent des sauvegardes quand celles-ci expirent |
| Sur ton téléphone | Jusqu'à ce que tu supprimes tes données ou l'appli |

## 10. Tes droits

Tu peux accéder à tes données, les corriger, les supprimer, les récupérer, t'opposer à leur utilisation ou la limiter, et retirer ton consentement. La plupart se font directement dans l'appli.

- **Télécharger tes données** : Réglages, « Télécharger mes données ». Tu reçois un fichier JSON avec ton profil, tes plateformes, ton choix sur les statistiques, Mes films et, pour chaque partie, ta place, tes réponses, tes votes et le film du soir. Jamais les données des autres joueurs. Une fois par heure au plus.
- **Supprimer tes données** : Réglages, « Supprimer mes données ». Ton profil, tes plateformes, Mes films, ton choix sur les statistiques et les statistiques reliées à ton profil sont effacés. Tes votes passés restent dans leurs salles, sans ton prénom. Le journal des connexions disparaît au bout de 90 jours au plus. Sans l'appli, la page [flimme.com/fr/suppression](https://flimme.com/fr/suppression) explique comment faire.
- **Corriger** : change ton prénom et ta couleur depuis l'accueil, et tes plateformes en préparant une partie. Dans Mes films, retire un film ou marque-le comme vu ou pas vu.
- **T'opposer** : désactive « Aider à améliorer l'appli ». Pour le journal des cartes, écris-nous.
- **Retirer ton consentement** : désactive « Stats détaillées ».
- **Toute autre demande**, y compris pour limiter l'utilisation de tes données ou dire ce que tu veux qu'on en fasse après ton décès : écris à [support@flimme.com](mailto:support@flimme.com).

Nous répondons dans un délai d'un mois. Comme tu n'as pas de compte, nous ne pouvons pas te retrouver à partir de ton adresse e-mail : les boutons de l'appli restent le moyen le plus sûr et le plus rapide.

Tu peux aussi adresser une réclamation à la CNIL, sur [cnil.fr](https://www.cnil.fr/fr/plaintes) ou par courrier : CNIL, 3 place de Fontenoy, TSA 80715, 75334 Paris Cedex 07.

## 11. Enfants

Flimme est une appli grand public. Elle ne demande ni date de naissance ni e-mail, et n'affiche aucune publicité. Si tu as moins de 15 ans, utilise Flimme avec l'accord d'un parent, et demande-lui avant d'activer les stats détaillées.

Quand l'hôte limite une salle aux films pour moins de 13 ans, aucun téléphone de la salle n'envoie de statistiques et les cartes n'ont pas de bouton bande-annonce.

Un profil sans activité pendant 90 jours est supprimé, comme quand tu supprimes tes données (voir les points 9 et 10).

## 12. Modifications

Cette politique date du 6 novembre 2026. Si nous la modifions, cette date change. Si un changement touche à ce que nous collectons ou à ce que nous en faisons, nous le signalerons dans l'appli avant qu'il s'applique.

Voir aussi nos [conditions d'utilisation](https://flimme.com/fr/conditions).
`;
