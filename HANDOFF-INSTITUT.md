# EXOTIC BEAUTY — HANDOFF (logique métier, flow, backend)

> Source de vérité pour la LOGIQUE. Le visuel = les maquettes validées + `DESIGN-PRINCIPES.md`.
> Les valeurs marquées **[À CONFIRMER]** viennent du site actuel ou sont des recommandations :
> l'onboarding avec Malorie les valide avant le code.

---

## 1. Contexte

- **Exotic Beauty** : studio privé de beauté du regard (cils & sourcils), Ducos, Martinique.
  Malorie travaille **seule** → **un seul agenda**, une cliente à la fois.
- Positionnement actuel : cocooning, résultat naturel, diagnostic offert, douceur.
- Trafic : Instagram (@exoticbeautycil) → **mobile-first absolu** (≈ 95 % mobile).
- Objectif : remplacer **Planity** par un site de réservation directe, avec acompte Stripe,
  WhatsApp automatiques, et **tracking Meta** (la raison n°1 du projet).

## 2. Stack

- Next.js (App Router) + TypeScript + Tailwind · **Vercel** · **Supabase** (Postgres).
- **Stripe** : Payment Element + Express Checkout (Apple Pay / Google Pay) — acompte.
- **Make + Whapi.cloud** (WhatsApp) · **Resend** (e-mails, fallback systématique).
- **Meta Pixel + Conversions API** (événement d'achat côté serveur, dédupliqué).
- **cron-job.org** pour les tâches planifiées (rappels, relances).
- ⚠️ Le site actuel tourne sur Railway : à trancher à l'onboarding (recommandation : Vercel,
  comme le reste de la stack et les leçons du playbook).

## 3. Catalogue des prestations (repris du site actuel) [À CONFIRMER]

**Extensions — pose complète**
| Prestation | Durée | Prix |
|---|---|---|
| Cil à cil | 1 h | 60 € |
| Mixte | 1 h 30 | 70 € |
| Volume russe | 2 h | 90 € |
| Wispy cil à cil | 1 h 10 | 55 € ⚠️ moins cher que le cil à cil classique ? |
| Wispy mixte | 2 h 20 | 75 € |
| Wispy volume russe | 2 h 10 | 95 € |
| Wet volume russe | 2 h 10 | 95 € |
| Lash lift + teinture | 45 min | 60 € |

**Remplissage** (dans les 3-4 semaines après la pose)
| Remplissage cil à cil | 45 min | 30 € |
| Remplissage mixte | 1 h 15 | 35 € |
| Remplissage volume russe | 1 h 45 | 45 € |

**Dépose** : 25 min · 20 € (uniquement poses faites chez Exotic Beauty)

**Sourcils**
| Ombré powder brow (maquillage permanent) | 1 h 30 | 200 € |
| Brow lift sans teinture | 30 min | 35 € |
| Brow lift + teinture | 1 h 30 | 60 € |
| Teinture hybride | 45 min | 35 € |
| Épilation au fil — restructuration | 15 min | 15 € |
| Épilation au fil — entretien | 10 min | 10 € |
| Épilation lèvre supérieure | 5 min | 10 € |

→ En base : table `prestations` (nom, slug, catégorie, durée_min, prix_cents, description
courte, description longue, photo, actif, ordre, `exige_questionnaire` bool, `type` :
`principale` | `complement`). **Modifiable depuis l'admin sans redéploiement.**

## 4. Architecture des pages

1. **Accueil** : hero (photo de regard + promesse + CTA) → preuve sociale (note Google) →
   **3 portes d'entrée** : « première pose de cils » · « mon remplissage » · « mes sourcils »
   → pourquoi ici → avant/après → avis → FAQ → footer. **Bookbar sticky** « réserver ».
2. **Page prestation** (une par prestation, ou par famille) — équivalent de la « page
   logement » : photos avant/après, durée, prix, ce qui est inclus (diagnostic offert),
   « pour qui », tenue dans le temps, préparation, FAQ ciblée, avis. **Module sticky bas**.
3. **Sélection du créneau** (bottom sheet).
4. **Checkout 1/2 — votre rendez-vous** (récap + compléments).
5. **Checkout 2/2 — acompte** (coordonnées + paiement).
6. **Confirmation**.
+ pages légales (CGV, mentions légales, confidentialité) + mini-admin.

## 5. Le flow de réservation (modèle « Expériences Airbnb »)

```
PAGE PRESTATION ─ sticky « voir les disponibilités »
   → BOTTOM SHEET : 1) choisir un JOUR (jours sans créneau barrés)
                    2) choisir une HEURE (pilules horaires)
                    → « continuer »  (le HOLD démarre ici)
   → CHECKOUT 1/2 « votre rendez-vous » : récap (prestation, date, heure, durée)
        + compléments optionnels (qui allongent la durée)
        + questions d'éligibilité (remplissage / powder brow)
        + détail du prix : total · acompte aujourd'hui · reste sur place
   → CHECKOUT 2/2 « acompte » : express checkout → ou carte → prénom, nom, e-mail,
        téléphone international (E.164) → « confirmer et payer l'acompte »
   → CONFIRMATION
```

**États du module sticky (page prestation)**
- État 1 (aucun créneau) : « à partir de 60 € · 1 h » + ★ note + CTA « voir les disponibilités ».
- État 2 (créneau choisi) : « mar. 14 oct · 10h00 » + total souligné (clic → détail) + CTA
  « réserver ».

### Règles métier critiques

**Moteur de créneaux**
- Créneaux calculés à partir de : horaires d'ouverture par jour de semaine (+ pause), exceptions
  (congés, jours bloqués), rendez-vous existants, holds actifs, **durée totale** (prestation +
  compléments) + **battement** [À CONFIRMER, ex. 15 min].
- Pas de grille : 15 min (on propose 9h00, 9h15…) — ou 30 min pour ne pas noyer la cliente
  [À CONFIRMER]. Recommandation : afficher les créneaux par blocs « matin / après-midi ».
- **Délai minimum** avant RDV [ex. 12 h] et **horizon** [ex. 60 jours] paramétrables.
- ⚠️ **Fuseau horaire : America/Martinique (UTC−4, pas d'heure d'été)** partout. Stocker en
  `timestamptz`, calculer « aujourd'hui » en heure de Martinique (piège classique : un serveur
  en UTC décale les jours).
- **Anti double-réservation au niveau de la base** : contrainte d'exclusion Postgres sur
  `tstzrange(debut, fin, '[)')` (btree_gist) pour les statuts `hold` et `confirmed`. Le code
  peut se tromper, la base non.

**Prochaines disponibilités (page prestation)**
- Section « Prochaines disponibilités » placée juste après la fiche technique : les 3 prochains
  créneaux libres pour l'effet choisi (calculés avec la même fonction que le bottom sheet, donc
  même durée + battement). La plus proche est mise en avant (« Demain, mer. 15 oct · 09:00 »).
- Un clic sur un créneau = hold posé + direction checkout 1 (on saute le calendrier).
- Lien « Voir tout le calendrier » → ouvre le bottom sheet classique.
- Se recalcule quand la cliente change d'effet (cil à cil 1 h ≠ volume russe 2 h).

**Hold + timer**
- Hold de **10 min** posé au clic « continuer » (le créneau est réservé pour elle).
- Bandeau timer sur les 2 étapes checkout, **jamais réinitialisé** en naviguant.
- À expiration : libération + message « ce créneau n'est plus réservé, choisissez-en un autre ».
- Purge des holds morts (expirés) avant chaque insertion (leçon du playbook).

**Compléments (équivalent des add-ons)**
- Exemples [À CONFIRMER] : dépose avant nouvelle pose (+25 min, 20 €), épilation au fil
  entretien, teinture hybride en complément d'un brow lift, colle sans latex (0 €, option).
- Un complément **allonge la durée** → si le créneau choisi devient trop court, on le signale
  et on renvoie au choix de l'heure. (C'est LA subtilité technique vs la villa.)
- Recommandation V1 : **1 prestation principale + compléments**, pas de panier libre de
  plusieurs prestations principales (trop complexe pour peu de gain).

**Éligibilité (intégrée au checkout 1, pas un formulaire à part)**
- **Remplissage** : « votre dernière pose date de… » (< 3 sem · 3-4 sem · > 4 sem) et « pose
  réalisée chez Exotic Beauty ? ». Si > 4 semaines ou pose faite ailleurs → message doux +
  bascule proposée vers la pose complète (ou dépose + pose). Évite les mauvaises surprises
  au studio.
- **Ombré powder brow** : case « j'ai lu les contre-indications et je n'en présente aucune »
  (lien qui déplie la liste). Ne PAS stocker de détails de santé : juste la case cochée.

**Prix et acompte**
- Total = prestation + compléments − remise éventuelle.
- **Acompte = 50 % du total [À CONFIRMER]**, arrondi à l'euro. Reste à payer sur place.
- Affichage type Airbnb : « payez 45 € aujourd'hui · 45 € à régler sur place ».
- Source unique du prix : UNE fonction serveur (ex. `buildQuote`) utilisée partout. Jamais
  de prix calculé à deux endroits différents.
- ⚠️ Vocabulaire juridique : « acompte » et « arrhes » n'ont pas les mêmes effets en droit
  français. Faire valider le mot et la clause CGV (conseil pro recommandé).

**Annulation / report / retard / no-show** [À CONFIRMER — contractuel]
- Proposition : report gratuit jusqu'à 48 h avant · acompte conservé si annulation < 48 h ou
  lapin · retard > 15 min = prestation écourtée ou reportée.
- Pill dynamique au checkout : « ✓ report gratuit jusqu'au [date − 48 h] ».
- V1 : reports et annulations **gérés à la main** via WhatsApp (lien « un empêchement ? »).

**Paiement**
- Le **webhook Stripe est la source de vérité** : la réservation passe `confirmed` uniquement
  quand Stripe confirme le paiement, avec **re-vérification atomique** du créneau.
- Express Checkout : exiger nom, e-mail, téléphone côté wallet (sinon résas sans contact).
- Téléphone : composant international, défaut 🇲🇶 +596, validation, **stockage E.164**.
  C'est la clé de toutes les automatisations WhatsApp.
- Numéro de réservation généré côté serveur (ex. `EB-2026-0001`).

**Confirmation (l'écran qui vend encore)**
- « ✓ c'est réservé ! » + récap (prestation, date, heure, adresse, acompte payé, reste).
- **Ajouter à mon agenda** (fichier .ics) + itinéraire (Google Maps / Waze).
- Rappel préparation (sans maquillage, pas de café juste avant…).
- 💎 **Upsell n°1 : « réservez déjà votre remplissage »** (pour une pose) → créneau proposé
  ~3 semaines plus tard, en 1 clic. C'est la récurrence qui fait le chiffre d'un institut.
- Déclenche l'événement d'achat Meta (côté serveur, une seule fois, dédupliqué).

## 6. Automatisations (Make + Whapi + Resend)

Webhook → Make (un seul scénario avec un **routeur** qui aiguille selon un champ `notif`) → Whapi.
Chaque message WhatsApp a son **fallback e-mail** (Resend).

| Quand | Message | Pourquoi |
|---|---|---|
| Immédiat | Confirmation + adresse + préparation | Rassure |
| Immédiat | Notif à Malorie (nouvelle résa) | Elle sait tout de suite |
| J-1 (ex. 18h) | Rappel : heure, adresse, préparation | **Divise les lapins** |
| J+1 | Conseils d'entretien + **demande d'avis Google** (lien direct) | Construit la preuve sociale hors Planity |
| J+18 (poses) | « Votre remplissage, c'est le moment » + lien | **Récurrence** |
| J+42 (lash/brow lift) | Relance renouvellement | Récurrence |
| +45 min après abandon | Relance panier abandonné (1 seule, douce) | Récupère des ventes |

- Garde-fous : jamais de WhatsApp sur un numéro non E.164 ; une colonne `*_sent_at` par
  message (anti-doublon) ; « Skip » en gestion d'erreur sur les modules Whapi (sinon Make se
  désactive tout seul).
- Ton des messages : humain, chaleureux, prénom de Malorie, très peu d'emojis.
- ⚠️ Whapi est une solution non officielle : parfait pour démarrer. À terme → API WhatsApp
  officielle (Meta).

## 7. Tracking Meta (le cœur du projet)
- **Pixel navigateur** chargé uniquement si la cliente accepte les cookies (bandeau simple
  accepter / refuser).
- **Conversions API (serveur)** envoyée depuis le webhook Stripe à chaque paiement, avec
  e-mail/téléphone/prénom/nom hashés, `fbc`/`fbp` si consentement.
- **Déduplication** : même `event_id` (ID du PaymentIntent) côté navigateur et serveur.
- Événement : `Purchase` avec `value` = **montant total de la prestation** (pas l'acompte) —
  à trancher, mais rester cohérent dans le temps.
- Événements intermédiaires utiles : `ViewContent` (page prestation), `InitiateCheckout`.

## 8. Mini-admin (plus tôt que chez Guillaume !)
Malorie gère ses rendez-vous **chaque jour** : elle doit pouvoir sans code :
- Voir l'**agenda** du jour / de la semaine.
- **Bloquer** un créneau ou une journée (perso, cliente prise par téléphone, congés).
- Ajouter un rendez-vous manuel (cliente fidèle par WhatsApp).
- Modifier prestations, prix, durées, horaires (paramètres).
- V1 simple : auth Supabase (un seul compte), pages protégées. Stats = plus tard.

## 9. Sortie de Planity (le jour J)
- Recenser **tous les RDV futurs** pris sur Planity → les ressaisir dans l'admin AVANT de
  fermer Planity (sinon double réservation).
- Période de transition la plus courte possible (deux agendas = risque de doublon).
- Récupérer ce qui peut l'être (liste clientes si export possible — à vérifier avec Planity).
- Prévenir les clientes (story Instagram, WhatsApp) : « on réserve maintenant ici ».
- Rediriger le lien en bio Instagram vers le nouveau site.
- Les avis Planity restent chez Planity : on relance la **fiche Google** (message J+1).

## 10. Plan de build par phases
0. Onboarding, comptes, connecteurs.
1. Maquettes (accueil, page prestation, créneaux, checkout 1 & 2, confirmation).
2. Site vitrine fidèle aux maquettes (contenus en base ou en fichiers `content/`).
3. Moteur de créneaux + holds + **mini-admin blocage**.
4. Stripe (test) : acompte, webhook, confirmation.
5. Automatisations Make/Whapi/Resend + crons (J-1, J+1, remplissage, panier abandonné).
6. Pixel + CAPI + bandeau cookies.
7. Prod : domaine, Stripe live, test réel de bout en bout, bascule Planity, lien en bio.
8. Pubs Meta.
