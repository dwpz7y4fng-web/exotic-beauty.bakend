# AUDIT — site actuel d'Exotic Beauty (25 sept. 2026)

> URL auditée : preview hébergée sur Railway (`exotic-beautybakend-production.up.railway.app`).
> Lecture du contenu texte de la page. Ce qui est **bien** est à garder ; ce qui **freine**
> est à corriger dans la refonte.

## ✅ À garder
- Le positionnement : **studio privé, cocooning, résultat naturel, diagnostic offert**.
- La barre de réassurance (diagnostic offert, matériel stérilisé, colle sans latex).
- Les descriptions de prestations détaillées (durée + prix visibles).
- La FAQ « avant votre premier rendez-vous » (très bonnes questions, à répartir sur les
  pages prestation concernées).
- Les preuves sociales chiffrées (4,9 Google, 5,0 Planity).
- Le principe d'un tunnel en 4 étapes (prestation → date → heure → coordonnées).

## 🔴 Ce qui freine la conversion
1. **La réservation est un formulaire en bas d'une page unique très longue.** Chaque
   « réserver → » renvoie vers une ancre en bas : la cliente doit rechoisir sa prestation.
   → Remplacer par des pages prestation + **module sticky** + bottom sheet créneaux.
2. **21 prestations listées à plat.** Paralysie du choix sur mobile.
   → Orienter d'abord : « première pose de cils » / « mon remplissage » / « mes sourcils ».
3. **Pas de photos avant/après visibles** dans les prestations (le déclencheur n°1 pour les
   cils). → En mettre partout.
4. **Aucun signal d'acompte ni de conditions** avant la dernière étape. → Afficher dès le
   checkout « payez X € aujourd'hui, Y € sur place » + pill report gratuit.
5. **Mentions Planity dans les avis** (lien vers la page Planity) → on renvoie les clientes
   vers la plateforme qu'on quitte. → Garder la note, retirer le lien ; pousser Google.
6. **Pas de tracking mesurable** (la raison du projet) → Pixel + CAPI.

## 🟠 Bugs et incohérences à corriger
- ⚠️ **Lien WhatsApp probablement cassé** : le numéro affiché est un **07** (mobile
  métropole = **+33**) mais le lien pointe vers `wa.me/596770211399` (indicatif **+596**).
  → À tester tout de suite ; si c'est bien un 07, le bon lien est `wa.me/33770211399`.
- Descriptions **copiées-collées** : « wispy pose cil à cil » et « wet volume russe »
  reprennent le texte du volume russe (bouquets 3D/4D/5D, « résultat intense »).
- **Prix à vérifier** : wispy cil à cil (55 €) moins cher que cil à cil classique (60 €) ;
  wispy mixte 2 h 20 à 75 € vs wispy volume russe 2 h 10 à 95 €.
- Titre du hero : « Votre regard, Un moment unique » (majuscule parasite, formulation à
  retravailler).
- « Épilation lèvres supérieur » → « lèvre supérieure ».
- Le message « Paiement annulé — votre créneau n'a pas été réservé » apparaît dans le
  contenu de la page : vérifier qu'il n'est pas **affiché à tout le monde** par défaut.
- Lien Google des avis = `google.com/maps` générique → mettre le lien direct de sa fiche.
- Hébergement Railway alors que la stack prévue est Vercel → à trancher (onboarding).

## 🎯 Priorités pour la refonte
1. Structure : accueil orientant + pages prestation + sticky + bottom sheet créneaux.
2. Avant/après + avis au bon endroit.
3. Acompte clair + conditions visibles.
4. Tracking Meta.
5. Automatisations (rappel J-1, avis Google J+1, relance remplissage).
