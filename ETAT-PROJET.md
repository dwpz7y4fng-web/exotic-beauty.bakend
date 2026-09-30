# ETAT-PROJET — Refonte Exotic Beauty

> Journal de bord. Mis à jour à la fin de chaque grosse session.
> Dernière mise à jour : 30 sept. 2026 — accueil refait d'après la maquette, réservation
> déplacée sur sa propre page (branche `refonte-accueil-maquette`, PR à valider).

## 0. Maquette
- **Accueil : finalisé** dans Claude Design (export « Accueil hors ligne ») avec les vraies
  photos, avis, horaires, vidéos stories. → Codé fidèlement dans `public/index.html`.
- Écrans 2 à 6 (prestation, créneau, rendez-vous, acompte, merci) : seulement le
  **wireframe** (`maquettes/wireframe-6-ecrans.html`), pas encore personnalisés/validés.
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

## 2. Ce qui existe déjà dans le code (≠ stack cible du kit)
- Express + Postgres (Railway) + Stripe Checkout + SMS Twilio. Détails dans `CLAUDE.md`.
- Déjà fonctionnel : calendrier de réservation, acompte Stripe, admin (réservations,
  blocage de créneaux, import clientes et RDV Planity), rappel SMS J-1, relance des
  clientes inactives, libération des résas « en attente » non payées (30 min).
- **À trancher** : rester sur Express/Railway (et l'améliorer) ou migrer vers
  Next.js/Supabase/Vercel comme le prévoit le kit.

## 3. Points ouverts (à décider par Malorie)
- **Horaires** : l'accueil affiche lun.–ven. 9h–12h / 12h30–17h, mais la réservation
  propose aussi le **samedi** et un créneau à **12h00** (`OPEN_HOURS` dans `server.js`).
  Aligner l'un sur l'autre.
- **Offre regard « dès 80 € »** : aucune remise n'existe en base ; cil à cil + brow lift
  = 95 € au paiement. Soit créer la vraie offre (prestation à 80 €), soit changer le texte.
- **Créneaux et durée** : un créneau = une heure fixe, quelle que soit la durée
  (un volume russe de 2 h ne bloque pas l'heure suivante). À revoir avec le moteur de
  créneaux (HANDOFF §5) — méthode à valider avant code.
- **Téléphone** : enregistré tel que tapé (pas en +596…). Nécessaire pour fiabiliser les
  SMS/WhatsApp — attention, la relance des inactives compare les numéros : à migrer proprement.
- **Prix à vérifier** (audit) : wispy cil à cil 55 € < cil à cil 60 € ; wispy mixte
  2 h 20 à 75 € vs wispy volume russe 2 h 10 à 95 €.
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
- [~] 4. Créneaux + mini-admin : version simple existante · moteur « durée » à faire
- [x] 5. Acompte Stripe (existant — webhook à renforcer : re-vérif du créneau, paiements orphelins)
- [~] 6. Automatisations : SMS J-1 + relance inactives existants · WhatsApp/e-mail à faire
- [ ] 7. Tracking Meta (Pixel + CAPI) + bandeau cookies
- [ ] 8. Mise en ligne + sortie de Planity
- [ ] 9. Pubs Meta

## 5. Prochaine action concrète
Tester la PR `refonte-accueil-maquette` sur iPhone (navigation privée), la valider,
puis trancher les points ouverts « horaires » et « offre regard ».
