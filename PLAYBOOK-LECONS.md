# PLAYBOOK — les leçons de la refonte de Guillaume (à ne pas réapprendre)

> Tirées de plusieurs mois de build d'un site de réservation directe en production
> (Next.js + Supabase + Vercel + Stripe + Make/Whapi + Resend + Meta CAPI).
> Chaque leçon = une erreur déjà payée ou une règle qui a fait ses preuves.
> **[UNIVERSEL]** = s'applique tel quel. **[ADAPTER]** = le principe tient, les détails changent.

---

## 1. Méthode de travail

- **[UNIVERSEL] Maquettes d'abord, code ensuite.** Les maquettes validées font foi pour le
  visuel. Coder sans maquette = refaire trois fois.
- **[UNIVERSEL] Méthode avant code.** Pour tout sujet sensible, Claude Code explique son plan,
  on valide, PUIS il code. On relit le diff avant de merger.
- **[UNIVERSEL] Une étape à la fois.** Les gros chantiers sont découpés en lots testables.
  Quand ça va trop vite : on s'arrête et on finit ce qui est commencé.
- **[UNIVERSEL] Diagnostic avant correction.** Logs Vercel, base Supabase, événements Stripe :
  on comprend la cause AVANT de toucher au code.
- **[UNIVERSEL] Vérifier le schéma avant de nommer une colonne.** Claude invente parfois des
  noms de colonnes plausibles → toujours interroger la base d'abord.
- **[UNIVERSEL] Simplicité assumée.** Petite structure = solution simple d'abord. Les cas
  rares (1 fois par an) se gèrent à la main en V1.
- **[UNIVERSEL] Tenir un `ETAT-PROJET.md` à jour** en fin de session : la conversation
  suivante repart sans rien réexpliquer.

## 2. Git & déploiement

- **[UNIVERSEL]** Branche dédiée → Pull Request → onglet « Files changed » relu → Merge →
  attendre la pastille **Production** (pas « Preview ») verte sur Vercel → tester.
- **[UNIVERSEL]** Ne jamais pousser directement en production sans validation.
- **[UNIVERSEL]** Les variables `NEXT_PUBLIC_*` sont **figées au moment du build** : si on en
  change une sur Vercel, il faut **redéployer**.
- **[UNIVERSEL]** Variables secrètes sur Vercel = cochées **Sensitive**.
- **[UNIVERSEL]** Vidéos lourdes : ré-encoder avant de les mettre dans le repo (ffmpeg :
  `scale=720:-2`, H.264 `crf 26`, `+faststart`, sans audio) → −85 % de poids. Pas d'attribut
  `poster` redondant, images optimisées : une page d'accueil est passée de 4,6 Mo à 0,6 Mo.

## 3. Base de données (Supabase)

- **[UNIVERSEL]** SQL en 3 temps : **SELECT (vérifier) → UPDATE → SELECT (confirmer)**.
- **[UNIVERSEL]** Jamais de `DELETE` sur une réservation : `status = 'cancelled'`.
- **[UNIVERSEL]** Suppressions de données : dans une transaction (`begin; … commit;`),
  après validation explicite.
- **[UNIVERSEL]** Migrations numérotées, exécutées **à la main** dans le SQL Editor, jamais
  appliquées automatiquement. Attention aux numéros en double.
- **[UNIVERSEL]** Apostrophes françaises en SQL : on les double (`l''institut`).
- **[UNIVERSEL]** Tables sensibles en RLS **sans policy** = accessibles uniquement côté
  serveur (ex. inscriptions newsletter).
- **[UNIVERSEL]** Tout ce qui est « paramètre business » (prix, durées, horaires, textes
  d'offre) vit **en base**, modifiable sans redéployer.

## 4. Réservation & anti double-réservation

- **[UNIVERSEL] La base est le dernier rempart** : contrainte d'exclusion Postgres sur les
  plages (`[)` = début inclus, fin exclue) pour `hold` + `confirmed`. Le code peut rater un
  cas, la contrainte non.
- **[UNIVERSEL] Hold + timer** : on bloque le créneau quelques minutes pendant le paiement ;
  le timer est global, ne se réinitialise jamais en naviguant.
- **[UNIVERSEL] Bug réel vécu — la cliente bloquée par elle-même** : une cliente avait un hold
  en cours sur le site ET payait en parallèle par un autre moyen ; le webhook a refusé
  l'insertion à cause de SON propre hold → payée sans réservation. Correctif : **purger les
  holds morts / chevauchants (statut `hold` uniquement) avant l'insertion**, 1 retry borné,
  et si conflit avec une vraie résa → alerte + remboursement manuel.
- **[UNIVERSEL] Filet de sécurité « paiement orphelin »** : si un paiement Stripe réussit sans
  créer de réservation → alerte immédiate + un cron de réconciliation quotidien qui compare
  Stripe et la base. Trois couches de protection plutôt que zéro.
- **[UNIVERSEL] Fuseau horaire** : toujours calculer « aujourd'hui » dans le fuseau local
  (America/Martinique), pas en UTC.

## 5. Paiement (Stripe)

- **[UNIVERSEL] Le webhook est la source de vérité.** Jamais de confirmation basée sur la
  page de retour du navigateur (la cliente peut fermer l'onglet).
- **[UNIVERSEL] Test → Live = zéro changement de code.** Seulement 3 variables Vercel :
  clé secrète, clé publique, secret du webhook (un **nouveau** endpoint webhook en live).
- **[UNIVERSEL] Méthode de test en live** : baisser temporairement un prix à ~0,50 €, faire
  une vraie réservation avec vraie carte et vrai numéro, vérifier toute la chaîne (paiement,
  WhatsApp, e-mail, notif), puis remettre les vrais prix.
- **[UNIVERSEL] Rejouer un événement** : si un webhook a échoué, on peut « Renvoyer »
  l'événement depuis le Dashboard Stripe (Développeurs → Événements) — après avoir vérifié
  que le créneau est libre et que l'idempotence ne bloque pas.
- **[UNIVERSEL] Express Checkout (Apple/Google Pay)** : exiger e-mail, téléphone et nom côté
  wallet, et les propager → sinon des réservations arrivent sans contact.
- **[UNIVERSEL] Apple Pay** : domaine à ajouter et vérifier dans Stripe. Test dans Safari.
- **[UNIVERSEL]** Faire le ménage des moyens de paiement inutiles dans Stripe.
- **[UNIVERSEL] Champ code promo « fantôme »** : un champ visible mais non câblé au paiement
  = promesse cassée. Soit on le câble, soit on ne l'affiche pas.
- **[UNIVERSEL] Idempotence** : tout ce qui débite, vire ou envoie a une colonne
  `*_at` posée uniquement au succès + une clé d'idempotence stable → jamais de double.
- **[UNIVERSEL]** Interdit en France de facturer les frais bancaires au client (surcharge
  carte). On ajuste le prix si besoin.
- **[ADAPTER] Paiement en 2 fois / acompte** : chez Guillaume, 50 % à la réservation et solde
  prélevé automatiquement plus tard. Pour un institut, plus simple : **acompte en ligne, reste
  sur place**. Même principe d'affichage : « payez X € aujourd'hui, Y € sur place ».
- **[ADAPTER] Virements différés** (payout manuel piloté par cron) : utile pour une location
  encaissée des mois à l'avance ; **inutile pour un institut** (RDV à quelques jours).

## 6. Téléphone & WhatsApp

- **[UNIVERSEL] Le téléphone est la clé de toutes les automatisations.** Composant
  international, validation, stockage **E.164** (`+596696…`).
- **[UNIVERSEL] Piège récurrent** : Martinique = **+596**, pas +33. Mais un numéro en **07** est
  métropolitain = **+33**. Défaut du sélecteur = 🇲🇶.
- **[UNIVERSEL] Jamais de WhatsApp sur un numéro non valide** : un numéro mal formé a fait
  tourner Make en boucle (timeout Whapi) jusqu'à le **désactiver**. Correctif : garde E.164
  avant tout envoi, e-mail envoyé quand même, et alerte au propriétaire « téléphone invalide ».
- **[UNIVERSEL] Make** : un seul scénario avec un **routeur** (filtres « Égal à », pas
  « contient ») plutôt que 10 scénarios ; gestion d'erreur **Skip** sur chaque module Whapi ;
  seuil de désactivation relevé.
- **[UNIVERSEL] Chaque WhatsApp a un fallback e-mail** (Resend).
- **[UNIVERSEL] Ton** : humain, prénom de la personne qui répond, minuscules chaleureuses
  possibles, 1-2 emojis max. Mention sous le champ téléphone qui vend le service au lieu de
  faire peur : « on vous accompagne par whatsapp : confirmation, rappel, conseils ».
- **[UNIVERSEL] Relance panier abandonné** : capter le téléphone dès qu'il est valide (à la
  sortie du champ), 1 seule relance ~45 min après, garde-fou « anti-payeur » (ne pas relancer
  quelqu'un qui a finalement payé), purge des vieux leads. Message court, humain, qui invite
  à répondre plutôt qu'à juste cliquer.
- **[UNIVERSEL] Tester sans se piéger** : les garde-fous excluent parfois tes propres numéros
  de test (déjà clientes) → un « total: 0 » peut vouloir dire que le système marche.

## 7. E-mails (Resend)

- **[UNIVERSEL]** Envoyer depuis un **sous-domaine** (`send.tondomaine.com`) pour ne pas
  casser les e-mails pro du domaine principal. DNS (DKIM, SPF, MX) → statut Verified.
- **[UNIVERSEL]** Retirer toute variable « destinataire de test » avant la mise en ligne.

## 8. Tracking Meta (la raison d'être du projet)

- **[UNIVERSEL]** Les outils tiers qui gèrent le tunnel (Shopify/app de résa, Planity…)
  cassent le tracking. Le site maison permet d'envoyer l'achat **côté serveur** (CAPI).
- **[UNIVERSEL] Deux canaux, un seul achat** : Pixel navigateur (si consentement) + CAPI
  serveur, **dédupliqués** par le même `event_id` (l'ID du PaymentIntent), même valeur,
  même devise.
- **[UNIVERSEL] Bandeau cookies simple** : accepter / refuser (binaire). Pixel chargé
  **uniquement** après « accepter ». CAPI serveur envoyé dans tous les cas (données minimales
  hashées) ; IP / user-agent / fbc / fbp seulement avec consentement.
- **[UNIVERSEL] Journaliser chaque envoi CAPI** dans les logs (`[capi] Purchase … events_received=…`)
  → on peut prouver ce qui est parti.
- **[UNIVERSEL]** Supprimer la variable `META_TEST_EVENT_CODE` en production (sinon les
  vraies ventes n'apparaissent pas dans les stats).
- **[UNIVERSEL]** Vérifier avec l'extension **Meta Pixel Helper** + Events Manager
  (déduplication) **avant** de lancer les pubs.
- **[UNIVERSEL]** Ne rien conclure sur l'attribution avant plusieurs ventes avec consentement.
  La vraie métrique business = **chiffre d'affaires total ÷ dépense pub** (MER).
- **[UNIVERSEL]** Débrancher l'ancien outil (Planity) de Meta pour éviter des événements
  parasites.

## 9. Mise en production

- **[UNIVERSEL]** Domaine : DNS vers Vercel (A + CNAME), SSL auto, redirection www ↔ apex.
- **[UNIVERSEL]** Après bascule de domaine : mettre à jour l'URL **partout** (Meta, Make,
  crons, webhooks Stripe, images utilisées dans les messages).
- **[UNIVERSEL]** Ne pas fermer l'ancien service tant que le nouveau n'a pas encaissé une
  vraie réservation de bout en bout.
- **[UNIVERSEL]** Pages légales (mentions légales, CGV, confidentialité) **avant** d'encaisser.
- **[UNIVERSEL] Hygiène des secrets** : si une clé est passée par le chat, la régénérer — et
  la remplacer **partout** (Vercel, `.env.local`, crons, Make), sinon tout casse (401).
- **[UNIVERSEL]** Crons (cron-job.org) protégés par un header `Authorization: Bearer <CRON_SECRET>`,
  notifications d'échec par e-mail activées.

## 10. Design & conversion

- **[UNIVERSEL]** Mobile-first : on conçoit pour un iPhone en main, depuis Instagram.
- **[UNIVERSEL]** Tester en **navigation privée** (le cache ment).
- **[UNIVERSEL]** Une animation qui ne sert pas la conversion et dont le rendu déçoit →
  on l'abandonne, on revient au statique (et on `git revert` proprement si elle est en prod).
- **[UNIVERSEL]** Le texte de la barre d'annonce sert à **vendre l'offre**, pas à répéter le
  slogan.
- **[UNIVERSEL]** Relire tous les textes placeholders (« à réécrire… ») avant la prod.
- Détails : voir `DESIGN-PRINCIPES.md`.
