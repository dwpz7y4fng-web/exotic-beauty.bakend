# ETAT-PROJET — Refonte Exotic Beauty

> Journal de bord. Mis à jour à la fin de chaque grosse session.
> Dernière mise à jour : 30 sept. 2026 — accueil refait d'après la maquette, réservation
> déplacée sur sa propre page (branche `refonte-accueil-maquette`, PR à valider).

## 0. Maquette
- **Accueil : finalisé** dans Claude Design (export « Accueil hors ligne ») avec les vraies
  photos, avis, horaires, vidéos stories. → Codé fidèlement dans `public/index.html`.
- Écrans prestation, rendez-vous, acompte, merci : **codés le 30 sept.** d'après les
  maquettes (`maquettes/prestation.dc.html`, `maquettes/reservation.dc.html`).
  Écarts volontaires : acompte réel (≈ 1/3, pas 50 %), pas de minuteur (pas encore de
  « hold » côté serveur), paiement sur la page Stripe (pas de champs carte sur le site),
  pas d'e-mail demandé (non stocké), rappel par SMS (pas encore WhatsApp).
  En attendant, `public/reserver.html` reprend le parcours existant (qui marche) avec la
  peau « clinique » : choix de la prestation → bottom sheet jour/heure → récap + acompte →
  Stripe. À remplacer écran par écran quand les maquettes seront validées.

## 1. Décisions prises
- Quitter Planity complètement (objectif de la refonte).
- Modèle de réservation : créneaux horaires façon « Expériences Airbnb ».
- Malorie travaille seule → un seul agenda.
- Direction visuelle : « clinique premium » (ardoise #1E2B31, brume #DCE6EA, Hanken
  Grotesk + IBM Plex Mono).
- WhatsApp : le numéro est un **07 → +33**. Liens corrigés en `wa.me/33770211399`.
- **Offre regard (30 sept.)** : 3 prestations dédiées en base — cil à cil + brow lift 1 h 45
  · 80 € · acompte 25 € ; mixte + brow lift 2 h 30 · 90 € · 30 € ; volume russe + brow lift
  2 h 45 · 110 € · 35 € (acompte ≈ 1/3, comme les autres). Wispy mixte : 1 h 40.
  → Script `migrations/001_offre_regard_et_wispy_mixte.sql` **exécuté sur Railway le 30 sept.** ✅
- **Horaires (30 sept.)** : lun., mar., jeu., ven. 9h–12h / 12h30–17h · mer. 9h–10h30 /
  12h–14h30 (pour le moment) · sam. 9h–12h / 12h30–18h · dim. fermé. Réglés dans
  `SCHEDULE` (`server.js`) + affichage sur l'accueil.
- **Créneaux selon la durée (30 sept.)** : un début est proposé toutes les 30 min, seulement
  si la prestation entière (durée totale des prestations choisies) tient dans une plage
  d'ouverture sans chevaucher un rendez-vous existant ou un créneau fermé (1 h). Re-vérifié
  au moment de réserver, avec un verrou par jour contre les réservations simultanées.
  Battement entre clientes : 0 min (`BUFFER_MINUTES`, à ajuster si besoin).

## 2. Ce qui existe déjà dans le code (≠ stack cible du kit)
- Express + Postgres (Railway) + Stripe Checkout + SMS Twilio. Détails dans `CLAUDE.md`.
- Déjà fonctionnel : calendrier de réservation, acompte Stripe, admin (réservations,
  blocage de créneaux, import clientes et RDV Planity), rappel SMS J-1, relance des
  clientes inactives, libération des résas « en attente » non payées (30 min).
- **À trancher** : rester sur Express/Railway (et l'améliorer) ou migrer vers
  Next.js/Supabase/Vercel comme le prévoit le kit.

## 3. Points ouverts (à décider par Malorie)
- **CGV / mentions légales** : liens présents dans le pied de page mais pages inexistantes
  — obligatoires puisque le site encaisse déjà des acomptes.
- **Politique d'annulation / report** : pas encore affichée au paiement.
- **Lien Google** : lien de recherche générique → mettre le lien direct de la fiche.
- Libellé en base « Épilation lèvres supérieur » (corrigé seulement à l'affichage, pour ne
  pas casser l'import Planity).
- Anciennes photos inutilisées dans `public/` (dont `IMG_8439.jpeg`, 13 Mo) : à supprimer
  si Malorie confirme.

## 4. Avancement par phase
- [~] 1. Maquette : accueil ✅ · écrans 2-6 à personnaliser
- [ ] 2. Onboarding (blocs 1-5) + comptes + connecteurs
- [~] 3. Site vitrine : accueil ✅ (PR) · pages prestation à faire (après maquette)
- [~] 4. Créneaux + mini-admin : durée prise en compte ✅ · horaires en base (modifiables sans code) à faire
- [x] 5. Acompte Stripe (existant — webhook à renforcer : re-vérif du créneau, paiements orphelins)
- [~] 6. Automatisations WhatsApp codées (30 sept.) : confirmation, notif Malorie, rappel J-1 18h,
  avis Google J+1, remplissage J+18, relance inactives. **À activer** : migration 002 + compte
  Whapi + variable `WHAPI_TOKEN` sur Railway. Pas d'e-mail (choix de Malorie).
- [ ] 7. Tracking Meta (Pixel + CAPI) + bandeau cookies
- [ ] 8. Mise en ligne + sortie de Planity
- [ ] 9. Pubs Meta

## 5. Prochaine action concrète
Tester la PR `refonte-accueil-maquette` sur iPhone (navigation privée), la valider,
merger la PR (script 001 déjà exécuté). ⚠️ Railway en essai gratuit : passer en payant avant l'expiration pour que le site reste en ligne.
