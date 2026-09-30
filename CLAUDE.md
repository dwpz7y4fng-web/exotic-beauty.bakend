# CLAUDE.md — règles pour Claude Code (repo Exotic Beauty)

Tu codes le site de réservation d'Exotic Beauty (institut cils & sourcils, Martinique).
La propriétaire, Malorie, est **débutante en code** : explique simplement, en français,
ce que tu fais et pourquoi. Un « chef d'orchestre » (Claude, côté claude.ai) valide les
méthodes et relit le travail.

## ⚠️ Le code RÉEL aujourd'hui (≠ la stack cible du kit)
Le kit décrit une stack cible (Next.js + Supabase + Vercel + Make/Whapi). **Le code actuel
est différent** — pars toujours de ce qui existe :
- `server.js` : serveur **Express** (Node) unique ; base **Postgres** via `pg` (`DATABASE_URL`),
  hébergé sur **Railway**. Schéma dans `schema.sql` (tables `services`, `bookings`,
  `clients`, `blocked_slots`) — lis-le avant de nommer une colonne.
- Paiement : **Stripe Checkout** (acompte = `deposit_cents` de chaque service, en base) ;
  le webhook `checkout.session.completed` passe la résa en `paid`.
- Rappels : **SMS Twilio** (cron J-1 à 10h) + relance des clientes inactives (lundi 10h).
- Site public en HTML/CSS/JS simple dans `public/` : `index.html` (accueil, maquette
  « direction clinique »), `reserver.html` (réservation), `confirmation.html`,
  styles partagés `styles.css` + `reserver.css`. Admin : `admin/admin.html` (Basic Auth).
- Créneaux : horaires par jour dans `SCHEDULE` (`server.js`), début toutes les 30 min,
  calcul selon la **durée totale** des prestations (`computeAvailableTimes`), re-vérifié dans
  `/api/book` sous verrou par jour. Index unique `(slot_date, slot_time)` hors `cancelled`.
- Offre regard = 3 lignes dédiées dans `services` (`offre_cil_a_cil`, `offre_mixte`,
  `offre_volume_russe`) avec leur propre prix / durée / acompte.
- Pas de TypeScript ni de lint configurés : la règle 13 ci-dessous devient
  « `node --check server.js` + test manuel des pages à 390 px ».
- La migration vers la stack cible (Next.js/Supabase/Vercel) est une **décision à prendre
  avec Malorie**, pas un réflexe. Tant qu'elle n'est pas prise, les migrations SQL vont dans
  `migrations/` (numérotées) et Malorie les exécute à la main.

## Fichiers de référence (à lire avant toute tâche importante)
- `docs/` : audit du site, guide du kit, instructions du chef d'orchestre.
- `maquettes/` : wireframe des 6 écrans (l'accueil finalisé = `public/index.html`).
- `HANDOFF-INSTITUT.md` — logique métier (source de vérité).
- `DESIGN-PRINCIPES.md` + les maquettes validées — visuel.
- `PLAYBOOK-LECONS.md` — erreurs déjà vécues à ne pas reproduire.
- `ETAT-PROJET.md` — où on en est.

## Règle n°0 — la maquette d'abord
Les écrans validés dans Claude Design (dossier `maquettes/`) sont la référence visuelle.
Si la maquette d'un écran n'existe pas ou n'est pas validée, **ne le code pas** : signale-le
à Malorie. Reproduis chaque écran fidèlement (espacements, couleurs, textes, comportement sticky).

## Règles de travail
1. **Méthode avant code** : pour toute tâche touchant la base, le paiement, les créneaux,
   les automatisations ou le tracking, **explique ton plan et attends le feu vert** avant
   d'écrire du code.
2. **Branche dédiée → PR** : jamais de push direct sur `main`. Résume la PR en français
   simple (ce qui change, comment tester).
3. **Vérifie le schéma** de la base avant d'utiliser un nom de colonne. N'invente jamais.
4. **Migrations SQL** : fichiers numérotés dans `migrations/`, que Malorie exécute
   **à la main** dans la console SQL de Railway. Ne les applique pas toi-même.
5. **Jamais de DELETE sur une réservation** → `status = 'cancelled'`.
6. **Secrets** : jamais en dur dans le code, jamais affichés. Uniquement via variables
   d'environnement. Si Malorie en colle un dans la conversation, rappelle-lui de ne pas le
   faire et qu'il faudra le régénérer.
7. **Une seule source de vérité pour le prix** (fonction serveur unique, ex. `buildQuote`).
8. **Webhook Stripe = source de vérité** de la confirmation, avec re-vérification atomique
   du créneau. Contrainte d'exclusion Postgres contre les doubles réservations.
9. **Fuseau America/Martinique** pour toute logique de date/heure. `timestamptz` en base.
10. **Téléphone en E.164**, défaut 🇲🇶 +596 ; aucun envoi WhatsApp sur un numéro invalide.
11. **Idempotence** : chaque envoi / débit a sa colonne `*_sent_at` / `*_at` posée au succès.
12. **Mobile-first** : vérifie chaque écran à 390 px. Fidélité aux maquettes.
13. Avant de dire « c'est fini » : `tsc --noEmit` + lint OK, et dis honnêtement ce qui n'a
    pas pu être testé en local.
14. Après chaque tâche, indique à Malorie **comment tester** sur son iPhone (navigation
    privée) et quoi vérifier.
