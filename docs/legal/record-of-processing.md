# Registre des activités de traitement de Flimme

Le registre que l'article 30 du RGPD demande au responsable du traitement, pour la première version de l'appli. Il suit le modèle de registre de la CNIL : une fiche par activité, avec la finalité, les personnes et les données, les destinataires, les transferts hors de l'Union européenne, les durées de conservation et les mesures de sécurité. Écrit le 5 novembre 2026 (tâche M8.10) à partir de la carte des données de [privacy.md](../product/privacy.md#what-we-store-and-why), de la politique de confidentialité (`mobile/src/content/legal/privacy.fr.ts`) et du code. [decisions.md](../decisions.md) l'emporte sur ce document. En français, la langue de travail de la CNIL.

Ce registre décrit ce que fait la première version, pas ce qui viendra (voir [Pas dans la première version](#pas-dans-la-première-version)). Toute pull request qui change ce que l'appli collecte, pourquoi, chez qui ou pour combien de temps met ce registre à jour en même temps que privacy.md et la politique.

## Sommaire

- [Le responsable du traitement](#le-responsable-du-traitement)
- [Les activités](#les-activités)
- [Ce qui vaut pour toutes les fiches](#ce-qui-vaut-pour-toutes-les-fiches)
- Fiches 1 à 12 : [profil invité](#fiche-1-profil-invité-et-connexion), [parties en groupe](#fiche-2-parties-en-groupe-et-salles), [solo et Mes films](#fiche-3-parties-en-solo-et-mes-films), [journal des cartes](#fiche-4-journal-des-cartes-et-statistiques-de-jeu), [signalements](#fiche-5-signalements-et-modération), [limites anti-abus](#fiche-6-limites-anti-abus), [journaux techniques](#fiche-7-journaux-techniques), [statistiques d'usage](#fiche-8-statistiques-dusage-posthog), [plantages](#fiche-9-rapports-de-plantage-et-alertes-sentry), [mises à jour](#fiche-10-mises-à-jour-de-lappli-expo), [sauvegardes](#fiche-11-sauvegardes), [support et droits](#fiche-12-support-et-demandes-dexercice-des-droits)
- [Pas dans la première version](#pas-dans-la-première-version)
- [Hors de ce registre](#hors-de-ce-registre)
- [Points ouverts](#points-ouverts)
- [Choix pris par défaut](#choix-pris-par-défaut)

## Le responsable du traitement

| Rubrique | Contenu |
| --- | --- |
| Responsable | Harry Viennot, développeur indépendant, à titre personnel (décidé le 29 octobre 2026, [decisions.md](../decisions.md)) |
| Adresse postale | Aucune n'est indiquée, ni dans la politique, ni dans les conditions d'utilisation. **Point ouvert pour l'avocat (M8.11)** : faut-il en publier une, et laquelle |
| Contact | support@flimme.com, aussi pour les demandes sur les données, tant qu'il n'existe pas d'adresse dédiée (décidé le 4 novembre 2026) |
| Délégué à la protection des données | Aucun. Il n'est pas obligatoire à notre lecture : pas de suivi systématique à grande échelle, pas de données sensibles comme activité de base. À revoir avec l'avocat quand le nombre de joueurs grandit, car les paquets sont construits par profilage |
| Représentant dans l'Union (article 27) | Sans objet si le responsable est établi dans l'Union. À confirmer avec l'adresse postale |
| Responsables conjoints | Aucun |
| Analyse d'impact (AIPD) | Recommandée avant le lancement (profilage, et des enfants peuvent jouer). Pas encore faite : c'est la décision M8.11 |
| Registre des violations de données | Pas encore tenu, et la procédure n'est pas écrite (tâche M8.13). Voir les [points ouverts](#points-ouverts) |

## Les activités

| N° | Activité | Base légale | Mise à jour |
| --- | --- | --- | --- |
| 1 | [Profil invité et connexion](#fiche-1-profil-invité-et-connexion) | Contrat (intérêt légitime pour le journal d'audit) | 6 nov. 2026 |
| 2 | [Parties en groupe et salles](#fiche-2-parties-en-groupe-et-salles) | Contrat | 5 nov. 2026 |
| 3 | [Parties en solo et Mes films](#fiche-3-parties-en-solo-et-mes-films) | Contrat | 5 nov. 2026 |
| 4 | [Journal des cartes et statistiques de jeu](#fiche-4-journal-des-cartes-et-statistiques-de-jeu) | Intérêt légitime | 5 nov. 2026 |
| 5 | [Signalements et modération](#fiche-5-signalements-et-modération) | Intérêt légitime | 5 nov. 2026 |
| 6 | [Limites anti-abus](#fiche-6-limites-anti-abus) | Intérêt légitime | 5 nov. 2026 |
| 7 | [Journaux techniques](#fiche-7-journaux-techniques) | Intérêt légitime | 5 nov. 2026 |
| 8 | [Statistiques d'usage (PostHog)](#fiche-8-statistiques-dusage-posthog) | Mesure d'audience exemptée, consentement, intérêt légitime, obligation légale | 5 nov. 2026 |
| 9 | [Rapports de plantage et alertes (Sentry)](#fiche-9-rapports-de-plantage-et-alertes-sentry) | Intérêt légitime | 5 nov. 2026 |
| 10 | [Mises à jour de l'appli (Expo)](#fiche-10-mises-à-jour-de-lappli-expo) | Contrat | 5 nov. 2026 |
| 11 | [Sauvegardes](#fiche-11-sauvegardes) | Intérêt légitime | 5 nov. 2026 |
| 12 | [Support et demandes d'exercice des droits](#fiche-12-support-et-demandes-dexercice-des-droits) | Intérêt légitime, obligation légale | 6 nov. 2026 |

## Ce qui vaut pour toutes les fiches

**Les personnes concernées** sont les joueurs. Il n'y a pas de compte : à la première ouverture, l'appli crée un profil invité, sans e-mail. L'appli est grand public et ne demande pas d'âge, donc des mineurs peuvent jouer, par exemple dans la salle d'un parent ou d'un ami. Elle ne demande jamais d'e-mail, de mot de passe ou de date de naissance, et n'accède ni à la position, ni aux contacts, ni à l'appareil photo, ni au micro, ni aux photos.

**Où sont les données.** En production, la base de données (Supabase) et le serveur (Fly.io) sont à Francfort. Certaines versions de test, qui ne sont pas celles des stores, utilisent une base en Irlande et un serveur à Londres. Le Royaume-Uni bénéficie d'une décision d'adéquation de la Commission européenne.

**Les sous-traitants** sont listés dans [privacy.md](../product/privacy.md#who-processes-data-for-us). Chacun traite les données selon nos instructions et un contrat de traitement des données (DPA). Supabase, Fly.io, Tigris, GitHub, Sentry, PostHog et Expo sont des entreprises américaines. Quand des données sont envoyées aux États-Unis ou peuvent y être consultées, le transfert est encadré par les clauses contractuelles types de la Commission européenne et, pour les entreprises qui y adhèrent, par le cadre de protection des données UE-États-Unis (Data Privacy Framework). OVH est une entreprise française.

**Les mesures de sécurité communes**, en termes généraux (le détail est dans [security.md](../architecture/security.md)) :

- **Accès aux données.** L'appli n'atteint la base que par le schéma `api`, avec une sécurité au niveau des lignes : un joueur ne lit que ses propres données et les salles où il a une place. Les tables elles-mêmes sont fermées aux téléphones.
- **Moindre privilège.** Un identifiant de base de données par processus du serveur. La clé secrète de Supabase n'est que dans le processus de l'API HTTP, qui ne sert qu'à supprimer un compte.
- **Comptes.** Harry est le seul à avoir accès aux données de production et aux consoles. Double authentification sur GitHub, Expo, Apple, Google Play, Supabase, TMDB, Fly.io, le registraire du domaine et la messagerie derrière ces comptes.
- **Chiffrement.** Toutes les connexions passent par HTTPS. Sur le téléphone, la session est chiffrée (AES-256-GCM, clé dans le trousseau d'iOS ou le Keystore d'Android), et iOS ne garde aucune réponse du serveur sur le disque.
- **Minimisation.** Pas d'e-mail, de mot de passe ni de photo : un prénom filtré et un avatar pris dans une liste. Les journaux, les rapports de plantage et les statistiques ne contiennent ni prénom, ni code de salle, ni e-mail, ni adresse IP.
- **Secrets.** Aucun secret dans le dépôt de code, avec la détection des secrets de GitHub et le blocage des envois qui en contiennent.
- **Conservation.** Une tâche quotidienne (`internal.run_retention`) efface ce que les règles ne gardent plus, et une autre supprime les invités inactifs depuis 90 jours ([operations.md](../architecture/operations.md#retention-jobs)).

## Fiche 1. Profil invité et connexion

| Rubrique | Contenu |
| --- | --- |
| Finalité | Créer un profil sans compte à la première ouverture, reconnaître le joueur d'une ouverture à l'autre, le montrer dans les salles, choisir le catalogue de son pays et la langue des cartes, retenir ses plateformes de streaming |
| Base légale | L'exécution du service que le joueur demande (contrat, article 6(1)(b) du RGPD). La session gardée sur le téléphone est strictement nécessaire au service (article 82 de la loi Informatique et Libertés) |
| Personnes concernées | Les joueurs |
| Données | **Identification** : un identifiant aléatoire (compte invité Supabase Auth et profil), le prénom ou le pseudo choisi (24 caractères au plus, filtré), un avatar pris dans une liste. **Préférences** : la langue, le pays réglé sur le téléphone, les plateformes de streaming. **Connexion** : les dates de création du profil et de dernier passage ; pour chaque session, l'adresse IP et l'identification technique de l'appli que Supabase Auth enregistre. Supabase Auth tient aussi un journal d'audit (`auth.audit_log_entries`, « le journal des connexions » dans la politique) : l'action (inscription, connexion, rafraîchissement ou révocation du jeton, déconnexion, suppression du compte), l'identifiant du compte, l'e-mail ou le téléphone s'il y en a un, le fournisseur et la date. Sa colonne `ip_address` n'est remplie que pour certaines actions (double authentification, clés d'accès, liaison d'identités, codes de secours) qu'un invité n'utilise pas : la version 2.197 de Supabase Auth n'y met aucune adresse pour les inscriptions, connexions, rafraîchissements et déconnexions. La politique dit qu'il peut en contenir une, par prudence. **Sur le téléphone** : la session, chiffrée |
| Données sensibles | Aucune |
| Destinataires | Harry. Supabase (base de données et connexion). Fly.io (le serveur supprime le compte à la demande, fiche 12). Les autres joueurs d'une salle voient le prénom, l'avatar et les plateformes, copiés sur la place (fiche 2) |
| Transferts hors UE | Données hébergées à Francfort. Supabase et Fly.io sont américains : clauses contractuelles types dans leurs DPA |
| Durée de conservation | Tant que le profil existe. Il est supprimé quand le joueur supprime ses données, ou après 90 jours sans activité. Une session, adresse IP comprise, est gardée jusqu'à sa fin, au plus tard jusqu'à la suppression du profil. Le journal d'audit de Supabase Auth : 90 jours au plus, même après la suppression du compte (promis par la politique du 6 novembre 2026, sur la base de notre intérêt légitime : la sécurité). Rien ne l'efface encore : la tâche M8.14 ajoute un effacement quotidien ou coupe sa copie dans la base, avant qu'une ligne de la production ait 90 jours (voir les [points ouverts](#points-ouverts)). Sur le téléphone, jusqu'à la suppression des données ou de l'appli |
| Sécurité | Les mesures communes. Prénoms normalisés et filtrés (liste de mots interdits en français et en anglais). Jetons d'accès valables une heure et détection de la réutilisation des jetons de rafraîchissement. Supabase limite les créations de comptes invités par adresse IP (30 par heure, la valeur que prévoit [operations.md](../architecture/operations.md#supabase-settings)) |

## Fiche 2. Parties en groupe et salles

| Rubrique | Contenu |
| --- | --- |
| Finalité | Faire tourner le jeu : créer une salle et la rejoindre (lien, code ou QR code), servir des films disponibles sur les plateformes du groupe, compter les votes, trouver le film du soir (match ou Final Cut), montrer le résultat et proposer une nouvelle partie. Montrer aux joueurs de la salle la progression de chacun et des compteurs |
| Base légale | Contrat. La file des votes pas encore envoyés, gardée sur le téléphone, est strictement nécessaire (article 82) |
| Personnes concernées | Les joueurs d'une salle |
| Données | **La salle** : son code, ses réglages, son état, ses horaires et les statistiques de la partie (nombre de joueurs, issue). **La place de chaque joueur** : une copie de son prénom, de son avatar et de ses plateformes ce soir-là, ses envies, comment il est arrivé (lien, code, QR code, retour, nouvelle partie), son rôle (hôte ou invité), ses heures d'arrivée, de départ et de dernière activité, son nombre de cartes, les coups de cœur et le veto qui lui restent. **Le jeu** : sa réponse à chaque film (J'aime, Bof, Coup de cœur, Déjà vu) et son heure, y compris l'heure notée par le téléphone ; ses votes au Final Cut ; le film du soir ; l'ordre et le score des cartes de son paquet. **Sur le téléphone** : les votes pas encore envoyés et les cartes de la prochaine partie |
| Données sensibles | Aucune n'est collectée. Les films qu'on aime peuvent laisser deviner des traits sensibles (arrêt C-184/20 de la CJUE) : nous n'en tirons aucune conclusion, nous ne les montrons pas hors de ce que décrit cette fiche, et nous ne les utilisons jamais pour de la publicité. **Avocat** : confirmer que cet usage reste hors de l'article 9 |
| Destinataires | Harry. Supabase (base de données et temps réel). Fly.io (le serveur calcule les statistiques des parties). Les joueurs de la même salle voient le prénom, l'avatar et les plateformes, la progression (par exemple « Sam a fini »), si un vote du Final Cut est validé (jamais son contenu) et, pendant la partie, des compteurs pour la salle, jamais qui a aimé. Après le film du soir, en mode Party, ils voient qui a aimé les autres films en lice (en mode Blind, seulement le nombre). Personne ne voit jamais qui a dit Bof |
| Transferts hors UE | Comme la fiche 1 |
| Durée de conservation | Tant que le profil du joueur existe. À la suppression du profil, sa place reste dans la salle sans prénom ni avatar et n'est plus reliée à son profil. Elle garde ses plateformes, ses envies, ses horaires et ses réponses, qui comptent dans les parties des autres. Une salle où la partie n'a jamais commencé est effacée 7 jours après sa fin, sauf si elle porte un signalement de moins de 12 mois (fiche 5). Les paquets des places sont effacés 1 jour après la fin de la salle, les cartes sur lesquelles personne n'a voté 7 jours après |
| Sécurité | Les mesures communes. Les réponses ne sont jamais envoyées aux autres téléphones pendant la partie. Codes de salle tirés au hasard. L'hôte peut retirer un joueur, qui perd l'accès à la salle, et verrouiller la salle |

## Fiche 3. Parties en solo et Mes films

| Rubrique | Contenu |
| --- | --- |
| Finalité | Jouer seul. Tenir Mes films : les films aimés, les coups de cœur, les films choisis avec un groupe, les films marqués comme déjà vus. Écarter des prochains paquets les films déjà vus |
| Base légale | Contrat |
| Personnes concernées | Les joueurs |
| Données | **Une partie en solo** est une salle à une seule place : mêmes données que la fiche 2. **Mes films**, par film et selon la source (partie en groupe ou en solo) : aimé et quand, coup de cœur, choisi avec un groupe et quand, marqué comme vu et quand |
| Données sensibles | Aucune n'est collectée. Même remarque que la fiche 2 sur ce que les films laissent deviner |
| Destinataires | Harry. Supabase. Personne d'autre : une partie en solo n'est visible que par le joueur, et Mes films n'apparaît jamais dans une salle, sur une carte ou dans une étiquette |
| Transferts hors UE | Comme la fiche 1 |
| Durée de conservation | Tant que le profil existe. La tâche de conservation ne les efface jamais. Le joueur peut retirer un film de Mes films ou changer « vu » à tout moment |
| Sécurité | Les mesures communes |

## Fiche 4. Journal des cartes et statistiques de jeu

| Rubrique | Contenu |
| --- | --- |
| Finalité | Voir quelles cartes plaisent et comparer des façons de construire le paquet, pour que les prochains soient meilleurs. Compter la limite de 100 cartes par jour en solo. Calculer des statistiques de jeu agrégées (temps jusqu'au film du soir, cartes par film choisi) par jour, pays, mode et taille de groupe. Cette version n'entraîne aucun modèle d'intelligence artificielle |
| Base légale | Notre intérêt légitime : améliorer les paquets, avec des données pseudonymes, jamais montrées ni vendues. Le joueur peut s'y opposer par e-mail, ou en supprimant ses données. Le test de mise en balance est à écrire avec l'AIPD |
| Personnes concernées | Les joueurs |
| Données | **Le journal des votes** : chaque vote et chaque annulation, la réponse, d'où venait la carte dans le paquet et son score, le temps passé dessus, si la carte a été retournée, l'heure. **Le journal des tirages** : chaque distribution de cartes (début de partie, recharge), la version du modèle, l'expérience et sa variante, la stratégie, le nombre de candidats, le temps de calcul, si le tirage vient du moteur de secours ; pour chaque carte distribuée à une place, sa position, son score, si elle a été tirée pour explorer, la probabilité qu'elle le soit et les caractéristiques que le modèle a vues. Tout est relié à la place dans la salle, jamais au prénom ni au profil. **Les statistiques de jeu** sont des agrégats sans aucun identifiant |
| Données sensibles | Aucune |
| Destinataires | Harry. Supabase |
| Transferts hors UE | Comme la fiche 1 |
| Durée de conservation | Journal des votes : 13 mois. Journal des tirages : 13 mois (la règle de 90 jours pour les cartes classées attend l'export d'entraînement, M22.1). Après la suppression d'un profil, ses places ne sont plus reliées à personne |
| Sécurité | Les mesures communes. Les statistiques agrégées sont des vues dans un schéma qu'aucun rôle de l'appli ne peut lire |

## Fiche 5. Signalements et modération

| Rubrique | Contenu |
| --- | --- |
| Finalité | Permettre à un joueur d'en signaler un autre (par exemple pour un prénom choquant), qu'Harry examine chaque signalement, et que l'hôte retire un joueur ou verrouille sa salle. Les stores d'applis l'exigent |
| Base légale | Notre intérêt légitime : la sécurité des joueurs et les règles des stores |
| Personnes concernées | Le joueur qui signale et le joueur signalé |
| Données | Quelle place a signalé quelle place, dans quelle salle, le motif choisi dans une liste (prénom choquant, spam ou sabotage, autre chose), la date et la date de l'alerte envoyée à Harry. Jamais de texte libre, ni de copie du prénom : Harry lit le prénom sur la place. Pour un joueur retiré par l'hôte, la date du retrait sur sa place |
| Données sensibles | Aucune |
| Destinataires | Harry seul. Le joueur signalé ne sait jamais qui l'a signalé. Sentry reçoit, pour l'alerte, les 8 premiers caractères de l'identifiant du signalement, sans prénom, code ni motif (fiche 9). Supabase |
| Transferts hors UE | Comme la fiche 1. Sentry : voir la fiche 9 |
| Durée de conservation | 12 mois, puis effacé, même si l'un des joueurs supprime ses données (les places sont alors anonymes). Une salle jamais commencée est gardée tant qu'elle porte un signalement de moins de 12 mois |
| Sécurité | Les mesures communes. Un signalement par paire de places, 10 par heure et par profil |

## Fiche 6. Limites anti-abus

| Rubrique | Contenu |
| --- | --- |
| Finalité | Empêcher de deviner les codes de salle, et limiter les appels répétés (par exemple rejoindre une salle, l'aperçu d'une salle, le téléchargement des données, les signalements, les parties en solo, les changements dans Mes films) |
| Base légale | Notre intérêt légitime : la sécurité du service |
| Personnes concernées | Les joueurs |
| Données | Des compteurs par action et par identifiant de profil. Pour rejoindre une salle et pour l'aperçu d'une salle, aussi des compteurs par adresse IP, enregistrée sous forme d'empreinte (sha256 ; une adresse IPv6 compte par son préfixe /64) |
| Données sensibles | Aucune |
| Destinataires | Personne. Supabase les héberge |
| Transferts hors UE | Comme la fiche 1 |
| Durée de conservation | 1 jour. Les compteurs d'un profil sont effacés avec lui |
| Sécurité | Les mesures communes. L'adresse IP n'est jamais gardée en clair |

## Fiche 7. Journaux techniques

| Rubrique | Contenu |
| --- | --- |
| Finalité | La sécurité et le bon fonctionnement : comprendre une panne, repérer un abus |
| Base légale | Notre intérêt légitime |
| Personnes concernées | Les joueurs |
| Données | **Supabase** : les requêtes reçues par l'API et la connexion, avec l'adresse IP. **Le serveur** : les identifiants de salle, de place et de profil, des durées, des codes de réponse et des types d'erreur ; jamais un prénom, un code de salle, un jeton, le contenu d'une requête ou une adresse IP |
| Données sensibles | Aucune |
| Destinataires | Harry. Supabase. Fly.io |
| Transferts hors UE | Comme la fiche 1 |
| Durée de conservation | 7 jours au plus : Supabase garde 1 jour sur l'offre gratuite et 7 sur l'offre Pro, la recherche dans les journaux de Fly.io 7 jours (vérifié le 5 novembre 2026) |
| Sécurité | Les mesures communes. Le serveur n'écrit que des champs d'une liste autorisée, et un filtre masque les jetons, les clés et les e-mails |

## Fiche 8. Statistiques d'usage (PostHog)

| Rubrique | Contenu |
| --- | --- |
| Finalité | Mesurer l'audience de l'appli et voir ce qui coince : les écrans ouverts, des actions (par exemple choisir son prénom, rejoindre une salle, créer une salle, partager une invitation, choisir ses plateformes, ouvrir « où regarder », partager le récap, commencer une partie en solo, ouvrir Mes films), des durées et les écrans d'erreur. Garder une trace du choix du joueur sur les statistiques |
| Base légale | **Dans l'Espace économique européen, au Royaume-Uni et en Suisse** : mesure d'audience exemptée de consentement selon les conditions de la CNIL, avec la possibilité de la refuser dans les Réglages. **« Stats détaillées »**, si le joueur les active : son consentement. **Ailleurs** : notre intérêt légitime, avec la possibilité de refuser. **La trace du choix** : notre obligation de prouver ce que le joueur a accepté (article 7(1) du RGPD) |
| Personnes concernées | Les joueurs. Aucun téléphone n'envoie de statistiques dans une salle limitée aux films pour moins de 13 ans, ni depuis une version de développement |
| Données | **Les événements**, avec la langue, le pays, une tranche du nombre de parties jouées (0, 1, 2 à 4, 5 ou plus), le modèle et le système du téléphone, la version de l'appli, le fuseau horaire et l'environnement. En Europe, ils portent un identifiant aléatoire gardé sur le téléphone, remplacé tous les 13 mois et jamais relié au profil. Avec « Stats détaillées », ou hors d'Europe, ils sont reliés à l'identifiant du profil. Jamais les votes, les films, le prénom, un code de salle ou l'adresse IP. **Le choix** (activé, désactivé ou stats détaillées), sa date et la version du texte affiché, avec l'historique des changements, dans notre base de données |
| Données sensibles | Aucune |
| Destinataires | Harry. PostHog (son offre européenne, à Francfort). Supabase, pour le choix |
| Transferts hors UE | Les événements restent à Francfort. PostHog est américain : clauses contractuelles types dans son DPA. **Avocat** : l'exemption de la CNIL tient-elle avec un prestataire américain |
| Durée de conservation | Événements : 25 mois au plus. Identifiant anonyme : remplacé tous les 13 mois. Choix : tant que le profil existe ; aucune preuve n'est gardée après la suppression dans cette version. Quand le joueur supprime ses données, le serveur efface aussi sa personne et ses événements dans PostHog. Quand un invité est supprimé après 90 jours, ses statistiques liées au profil, s'il y en a, disparaissent au bout de 25 mois au plus |
| Sécurité | Les mesures communes. Pas de profils de personne en Europe par défaut, collecte de l'adresse IP désactivée, pas d'enregistrement de session, pas de capture du texte saisi. Un seul projet, sans identifiant partagé avec d'autres applis ou sites |

## Fiche 9. Rapports de plantage et alertes (Sentry)

| Rubrique | Contenu |
| --- | --- |
| Finalité | Corriger les plantages de l'appli et du serveur. Prévenir Harry quand un seuil de fonctionnement est franchi ou qu'un signalement arrive (un contrôle toutes les 5 minutes) |
| Base légale | Notre intérêt légitime : une appli qui plante ne rend pas le service. **Avocat** : les règles françaises sur les traceurs (article 82) demandent-elles un consentement pour l'outil de rapports de plantage dans l'appli |
| Personnes concernées | Les joueurs |
| Données | L'erreur, l'endroit du code où elle s'est produite, le modèle et le système du téléphone, la version de l'appli, l'environnement. Côté serveur, le type d'erreur sans son texte, le processus et, pour un message de file en échec, son identifiant. Les alertes portent des nombres et des seuils et, pour un nouveau signalement, les 8 premiers caractères de son identifiant. Jamais d'utilisateur, d'adresse IP, de prénom, de code de salle ou d'e-mail, ni rien qui relie le rapport à un profil |
| Données sensibles | Aucune |
| Destinataires | Harry. Sentry (sa région européenne, à Francfort) |
| Transferts hors UE | Sentry est américain et indique que certains types de données peuvent être stockés aux États-Unis : clauses contractuelles types dans son DPA |
| Durée de conservation | 90 jours au plus : Sentry garde 30 jours sur l'offre gratuite, jusqu'à 90 sur l'offre Team (vérifié le 5 novembre 2026) |
| Sécurité | Les mesures communes. Données personnelles désactivées dans l'outil, et un filtre retire l'utilisateur, la requête, les en-têtes, les identifiants, le texte des erreurs et les variables locales. Pas de capture d'écran. Les versions de développement n'envoient rien |

## Fiche 10. Mises à jour de l'appli (Expo)

| Rubrique | Contenu |
| --- | --- |
| Finalité | Livrer les mises à jour de l'appli (corrections) sans passer par les stores |
| Base légale | Contrat : une appli qui ne reçoit pas ses corrections cesse de fonctionner. Choix pris par défaut, à confirmer avec l'avocat |
| Personnes concernées | Les joueurs |
| Données | Quand l'appli cherche une mise à jour, Expo reçoit le système du téléphone, un identifiant aléatoire et l'adresse IP. Pas de jeton de notification : l'appli n'utilise pas le service de notifications d'Expo |
| Données sensibles | Aucune |
| Destinataires | Expo (EAS Update) |
| Transferts hors UE | Vers les États-Unis : cadre UE-États-Unis et clauses contractuelles types (politique d'Expo du 21 octobre 2025) |
| Durée de conservation | Fixée par Expo, pas encore relevée. **À vérifier** |
| Sécurité | Seul Harry peut publier une mise à jour, avec la double authentification sur le compte Expo |

## Fiche 11. Sauvegardes

| Rubrique | Contenu |
| --- | --- |
| Finalité | Pouvoir restaurer le service après un incident |
| Base légale | Notre intérêt légitime : la disponibilité et la sécurité des données (article 32 du RGPD). Choix pris par défaut |
| Personnes concernées | Les joueurs |
| Données | Une copie de la base : les comptes invités et tout ce que décrivent les fiches 1 à 6 et le choix sur les statistiques de la fiche 8. Les sauvegardes quotidiennes de Supabase copient toute la base, files de messages et historique des tâches planifiées compris. La copie hebdomadaire laisse de côté les files de messages, l'historique des tâches planifiées et les schémas propres à Supabase |
| Données sensibles | Aucune |
| Destinataires | Harry, seul à détenir la clé qui déchiffre la copie hebdomadaire. Supabase (sauvegardes quotidiennes). GitHub (son service Actions fabrique la copie hebdomadaire : elle existe en clair sur la machine de GitHub jusqu'à son chiffrement). Tigris (stockage de la copie chiffrée) |
| Transferts hors UE | La machine de GitHub tourne aux États-Unis : DPA de GitHub et cadre UE-États-Unis. Tigris est américain : son DPA. Le stockage est prévu à Francfort, voir les [points ouverts](#points-ouverts) |
| Durée de conservation | Copies quotidiennes de Supabase : 7 jours. Copie hebdomadaire chiffrée : 28 jours. Les données supprimées disparaissent des sauvegardes quand celles-ci expirent ; les copies ne sont pas réécrites (choix pris le 4 novembre 2026, à revoir avec l'avocat) |
| Sécurité | La copie hebdomadaire est chiffrée avec `age` avant de quitter la machine de GitHub, et le fichier en clair est effacé aussitôt. La clé privée n'existe que dans le gestionnaire de mots de passe d'Harry. Le stockage est privé, avec une clé d'accès limitée à lui. Une copie n'est jamais un artefact du dépôt, qui est public. Un exercice de restauration est prévu avant la bêta fermée, puis tous les 6 mois |

## Fiche 12. Support et demandes d'exercice des droits

| Rubrique | Contenu |
| --- | --- |
| Finalité | Répondre aux joueurs qui écrivent à support@flimme.com. Traiter les demandes d'exercice des droits et les signalements de contenus illicites. Dans l'appli, laisser chaque joueur télécharger ou supprimer ses données lui-même |
| Base légale | Notre intérêt légitime pour répondre aux messages. Notre obligation légale pour les demandes d'exercice des droits (articles 12 à 22 du RGPD) |
| Personnes concernées | Toute personne qui écrit (joueurs, parents), et les joueurs qui utilisent les boutons de l'appli |
| Données | **Par e-mail** : l'adresse de l'expéditeur, son message, les dates. Le message préparé par l'appli porte la version de l'appli et le système du téléphone, sans identifiant. **Dans l'appli** : le téléchargement produit un fichier JSON avec les données du joueur, remis au téléphone et pas gardé sur le serveur ; la suppression efface le compte invité, et tout ce qui en dépend suit (fiches 1 à 3 et 8) |
| Données sensibles | Aucune n'est demandée. Un message peut en contenir si son auteur l'écrit |
| Destinataires | Harry. OVH (la boîte de support@flimme.com : les enregistrements MX du domaine pointent vers le service de courrier d'OVH, et l'enregistrement SPF ne laisse qu'OVH envoyer pour le domaine, vérifié le 6 novembre 2026). Fly.io (le serveur exécute la suppression), Supabase et PostHog (fiches 1 et 8) |
| Transferts hors UE | Aucun pour les e-mails : OVH est français, ses serveurs de courrier sont en France. Harry confirme que la boîte n'est pas renvoyée ailleurs (voir les [points ouverts](#points-ouverts)). Pour la suppression, comme les fiches 1 et 8 |
| Durée de conservation | Les e-mails : le temps de répondre, puis 12 mois au plus après le dernier échange (choix pris pour la politique, M8.1, à confirmer par Harry). Le fichier téléchargé n'est pas gardé sur le serveur. Une suppression laisse une ligne avec des identifiants dans les journaux du serveur, 7 jours au plus (fiche 7) |
| Sécurité | Les mesures communes. Un invité n'a pas d'e-mail et ne peut pas être retrouvé par ce moyen : il est renvoyé aux boutons de l'appli. Le téléchargement ne rend que les données de celui qui le demande, une fois par heure au plus. La suppression ne vise que le compte du jeton qui la demande. Réponse dans un délai d'un mois |

## Pas dans la première version

Rien de ce qui suit n'est collecté aujourd'hui. Chacun ajoute une fiche ou en change une avant de sortir, en même temps que la politique.

- Les comptes Apple et Google (l'e-mail et le nom qu'ils transmettent).
- La connexion à Letterboxd : le journal, les notes, la liste d'envies et le flux public, sur la base du consentement. Les tables existent et restent vides.
- Les notifications, dont le rappel « Tu l'as regardé ? ».
- Le profil de goût, la mémoire des cartes entre les parties et le test de goût. La table du profil de goût existe et reste vide.
- L'entraînement de modèles sur les parties et ses exports (24 mois prévus), avec le réglage pour s'y opposer.
- Une preuve minimale de consentement après la suppression d'un compte.
- Les profils famille, l'abonnement Pro et RevenueCat.

## Hors de ce registre

Ces traitements ne sont pas les nôtres, ou ne touchent pas de données personnelles :

- **Le catalogue de films** vient de TMDB et ne contient pas de données personnelles. Les affiches et les logos se chargent depuis les serveurs d'images de TMDB, qui voient l'adresse IP du téléphone comme n'importe quel site. Nous n'envoyons à TMDB aucune donnée sur les joueurs.
- **La bande-annonce** s'ouvre sur YouTube, et « où regarder » ouvre une page de TMDB (avec les données de JustWatch) : leur politique s'applique.
- **Apple et Google** distribuent l'appli selon leurs propres règles, comme responsables indépendants.
- **Le site flimme.com** (page d'invitation et pages légales) tourne sur le serveur privé d'Harry chez OVH, à Gravelines. Il n'ouvre aucune session, ne crée aucun compte invité, ne mesure pas l'audience et ne garde aucun journal des visites.

## Points ouverts

Pour Harry et pour la revue de l'avocat (M8.11) :

1. **L'adresse postale** du responsable n'apparaît nulle part (politique, conditions, registre). Faut-il en publier une ?
2. **L'AIPD** n'est pas faite. Elle reprendrait les tests de mise en balance des fiches 4 à 7, 9 et 11.
3. **La boîte de support.** Les enregistrements MX de flimme.com pointent vers le service de courrier d'OVH, et l'enregistrement SPF ne laisse qu'OVH envoyer pour le domaine (vérifié le 6 novembre 2026). La politique dit donc que la boîte est chez OVH, en France. Harry confirme qu'elle n'est pas renvoyée vers une autre messagerie : dans ce cas, ce prestataire serait un destinataire de plus, peut-être hors de l'Union, et la politique devrait le nommer.
4. **La région du stockage des sauvegardes.** Selon le type de bucket, Tigris peut placer un objet près de la machine qui l'écrit, et la copie hebdomadaire part d'une machine de GitHub aux États-Unis. Harry vérifie que le bucket est limité à Francfort, comme le disent privacy.md et la politique. La copie est chiffrée de toute façon.
5. **Les contrats de traitement (DPA).** Harry garde une copie de celui de chaque prestataire : Supabase, Fly.io, Tigris, GitHub, Sentry, PostHog, Expo et OVH.
6. **Expo** : relever combien de temps il garde les données des vérifications de mise à jour (fiche 10).
7. **Le journal d'audit de Supabase Auth** (`auth.audit_log_entries`) n'a aucune règle d'effacement, même après la suppression du compte. Pour un invité, il ne contient pas d'adresse IP dans la version actuelle de Supabase Auth (fiche 1), mais la politique dit qu'il peut en contenir une. Depuis le 6 novembre 2026, la politique promet 90 jours au plus. La tâche M8.14 tient cette promesse : un effacement quotidien dans `internal.run_retention`, ou la copie dans la base coupée (Authentication, Audit Logs, « Write audit logs to the database » : il reste alors les journaux de Supabase, 7 jours au plus). Harry choisit entre les deux. Elle doit sortir avant qu'une ligne de la production ait 90 jours.
8. **Les violations de données.** Le délai de 72 heures pour prévenir la CNIL (article 33 du RGPD) est connu, mais la procédure n'est écrite nulle part, et le registre des violations que l'article 33(5) demande n'est pas tenu. La tâche M8.13 écrit les deux.
9. **La politique de confidentialité** avait quatre écarts avec le code, corrigés le 6 novembre 2026 : les limites anti-abus servent aussi à limiter les appels répétés (fiche 6) ; le journal des cartes note aussi si la carte a été retournée (fiche 4) ; OVH, pour la boîte de support et le serveur du site, est dans la liste des prestataires ; le journal d'audit de Supabase Auth y figure, sous le nom « journal des connexions » (point 7).

## Choix pris par défaut

Personne n'avait tranché ces points ; ce sont les options les plus prudentes, à confirmer par Harry (aussi dans [decisions.md](../decisions.md)) :

- Le registre est en français seulement, dans `docs/legal/`, car privacy.md ne disait pas où le tenir et son plan ne demande pas de version anglaise.
- Douze fiches, une par finalité, plutôt qu'une fiche par table ou par prestataire.
- Trois bases légales que la documentation ne donnait pas : le contrat pour les mises à jour d'Expo, l'intérêt légitime pour les sauvegardes et pour les statistiques de jeu agrégées, l'obligation légale pour les demandes d'exercice des droits. Elles sont à revoir avec l'avocat.
- Aucun délégué à la protection des données (comme le dit privacy.md) et aucun représentant dans l'Union.
- Les demandes d'exercice des droits reçues par e-mail suivent la durée des e-mails de support (12 mois au plus après le dernier échange).
- Le journal d'audit de Supabase Auth (6 novembre 2026) : 90 jours au plus, sur la base de notre intérêt légitime (la sécurité), et la politique dit qu'il peut contenir l'adresse IP même si la version actuelle n'en note pas pour un invité. Cette durée reste vraie que M8.14 efface les lignes ou coupe la copie dans la base.
- La boîte de support (6 novembre 2026) : la politique dit qu'elle est chez OVH, en France, d'après les enregistrements MX et SPF, tant qu'Harry n'a pas dit qu'elle renvoie ailleurs.
