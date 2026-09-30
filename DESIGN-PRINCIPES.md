# DESIGN-PRINCIPES — ce qui fait convertir un site de réservation mobile

> La STRUCTURE ci-dessous vient d'un site de réservation qui convertit en production.
> La PEAU (couleurs, typo, photos) est celle d'Exotic Beauty — définie à l'onboarding.
> Les maquettes validées font foi ; ce document fixe les règles.

---

## 0. La direction retenue comme base : « clinique premium »
(inspirée de Qoves — à personnaliser par Malorie dans la maquette)
- Couleurs : ardoise `#1E2B31` (texte, CTA décisifs), brume `#DCE6EA` (étapes intermédiaires),
  fond froid `#F3F6F7`, filets `#D9E0E3`, noir profond `#141D21` (hero, footer, cartes fortes).
- Typo : Hanken Grotesk (titres et textes) + IBM Plex Mono en petites majuscules pour les
  étiquettes (« 01 — prestations », « durée », « courbure · C »).
- Titres en deux tons : début en ardoise, fin en gris doux.
- Signature : le **diagnostic** — photos annotées de repères, fiches techniques en lignes,
  chiffres mis en avant (5 ans · 4,9 · 1 cliente à la fois).
- Accueil : vidéo plein écran + barre d'annonce qui défile + header sticky en overlay +
  preuve sociale au-dessus du titre + UN seul CTA « Réserver mon rendez-vous », qui devient sticky en bas de l'écran au scroll.
- Hiérarchie boutons : ardoise pleine = moment décisif · brume = intermédiaire · contour = secondaire.

## 1. Les 10 principes non négociables

1. **Mobile-first.** On dessine pour un écran de ~390 px de large, tenu d'une main.
2. **Un CTA de réservation toujours visible** : barre sticky en bas d'écran (jamais un
   formulaire caché en bas d'une longue page).
3. **Tunnel en étapes courtes**, une décision par écran : créneau → rendez-vous → acompte →
   confirmation. Barre de progression (2 segments) dans le checkout.
4. **Le choix du créneau en bottom sheet** (panneau qui monte du bas), comme Airbnb : on ne
   quitte pas la page, on reste dans le désir.
5. **Le prix est clair dès le début** : « à partir de X € · durée ». Au checkout, détail
   ligne par ligne + « payez X € aujourd'hui, Y € sur place ».
6. **La preuve sociale est partout où l'on hésite** : note ★ à côté du CTA, avis au
   checkout 2, avant/après sur les pages prestation.
7. **Photo-first.** De belles photos (avant/après, gestes, studio) valent 10 paragraphes.
8. **Couleur d'engagement RARE** : la couleur/dégradé le plus fort de la marque est réservé
   aux **moments décisifs** (« réserver », « confirmer et payer »). Les étapes
   intermédiaires (« continuer ») = bouton sombre plein. Rare = impactant.
9. **Rassurer au moment de payer** : cadenas, pill « report gratuit jusqu'au… », mention
   WhatsApp, avis.
10. **Voix humaine** : on vend un moment pour soi, pas une prestation technique.

## 2. Hiérarchie des boutons
| Rôle | Style | Exemples |
|---|---|---|
| Moment décisif | Couleur d'engagement (dégradé ou accent fort), pilule, 52-56 px | « réserver », « confirmer et payer l'acompte » |
| Point d'entrée du tunnel | Variante de la couleur d'engagement | « voir les disponibilités » |
| Étape intermédiaire | Pilule sombre pleine | « continuer », « aller au paiement » |
| Secondaire | Ghost (bordure 1.5 px) | « ajouter à mon agenda », « nous écrire » |
| Doux | Fond gris très léger | « lire la suite », « voir toutes les prestations » |

Cibles tactiles ≥ 44 px. États press : `scale(0.97)`.

## 3. Composants clés (à reprendre)
- **Barre d'annonce** (haut, défilante) : vend l'offre ou la réassurance (« diagnostic
  offert · colle sans latex sur demande »).
- **Header** : logo + 2 boutons ronds (menu, réserver/calendrier).
- **Module sticky bas (page prestation)** : état 1 « à partir de 60 € · 1 h ★ 4,9 » + CTA ;
  état 2 date/heure + total souligné (clic → détail du prix) + « réserver ».
- **Bottom sheet créneaux** : croix fermer + « effacer » ; titre « choisissez votre jour » ;
  bande de jours (scroll horizontal ou calendrier mensuel) — jours sans dispo grisés ;
  puis **pilules horaires** groupées « matin / après-midi » ; barre basse : récap + « continuer ».
- **Bandeau timer** (checkout) : fond sombre, texte blanc, « votre créneau est réservé
  pendant 9:32 ».
- **Carte complément** : grille 2 colonnes, fond doux, icône, titre, prix, **toggle** ;
  bordure 1.5 px sombre quand sélectionnée.
- **Carte détail du prix** : bordure 1 px, lignes espacées, total en gras, puis
  « acompte aujourd'hui » mis en valeur.
- **Champ téléphone international** : drapeau + indicatif + saisie, 52 px, radius 12.
- **Accordéons** (FAQ, « à savoir ») : un seul ouvert à la fois, chevron qui pivote.
- **Carrousels horizontaux** : cartes à 70-75 % de largeur (on voit qu'il y a une suite),
  scroll-snap, scrollbar masquée.
- **Avant/après** : grille ou carrousel de photos carrées, légende courte (technique utilisée).
- **Avis** : cartes avec prénom, prestation, étoiles couleur encre (jamais jaune criard).

## 4. Rythme et lisibilité
- Deux fonds qui alternent (ex. blanc / nude doux) pour rythmer les sections.
- Checkout = fond blanc, les couleurs douces seulement dans les cartes.
- Une seule famille de police (2 graisses principales), titres courts.
- Corps 14-15 px, labels 13 px, jamais de gris trop clair sur fond clair (contraste AA).
- Coins arrondis cohérents : 12 px champs · 16 px cartes · 24 px grandes cartes / sheet ·
  pilule pour les boutons.

## 5. Accessibilité & perf
- Focus visible, alt descriptifs sur les photos, `prefers-reduced-motion` respecté.
- Images optimisées (next/image), vidéos compressées, pas de poids inutile : le site doit
  s'afficher vite en 4G.

## 6. Ce qu'on NE fait PAS
- Pas de formulaire de réservation en bas d'une page unique à atteindre en scrollant.
- Pas de liste de 20 prestations à plat sans guide : on **oriente** d'abord
  (première pose / remplissage / sourcils).
- Pas de textes copiés-collés d'une prestation à l'autre.
- Pas d'animation gadget qui ralentit ou distrait.
- Pas de lien vers une plateforme concurrente (Planity) dans le parcours de réservation.
