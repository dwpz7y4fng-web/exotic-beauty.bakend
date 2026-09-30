# KIT « REFONTE EXOTIC BEAUTY » — à lire en premier

> Préparé par Guillaume (qui a fait exactement le même chemin pour son site de réservation)
> pour Malorie, fondatrice d'Exotic Beauty (cils & sourcils, Ducos, Martinique).
> Objectif : quitter Planity, avoir TON site de réservation, et pouvoir faire de la pub Meta
> qui se mesure vraiment.

---

## Ce que contient ce kit

| Fichier | À quoi il sert | Où le mettre |
|---|---|---|
| `00-LISEZ-MOI.md` | Ce guide d'installation | Tu le lis, c'est tout |
| `INSTRUCTIONS-PROJET.md` | Transforme Claude en ton « chef d'orchestre » | Dans les **instructions** de ton Projet Claude |
| `HANDOFF-INSTITUT.md` | Toute la logique de TON business (créneaux, acompte, remplissage…) | Fichier du Projet Claude + racine de ton repo |
| `PLAYBOOK-LECONS.md` | Tout ce que Guillaume a appris (erreurs évitées, règles qui marchent) | Fichier du Projet Claude + racine de ton repo |
| `DESIGN-PRINCIPES.md` | Les règles UX qui font convertir un site de réservation mobile | Fichier du Projet Claude + racine de ton repo |
| `AUDIT-SITE-ACTUEL.md` | Ce qui freine ton site actuel, point par point | Fichier du Projet Claude |
| `ETAT-PROJET.md` | Le journal de bord de ton projet (vierge au départ) | Fichier du Projet Claude + racine de ton repo |
| `CLAUDE.md` | Les règles de travail pour Claude Code (celui qui code) | **Racine de ton repo** (Claude Code le lit tout seul) |
| `maquette/` | Les 12 écrans en HTML (direction clinique + wireframe). Ouvre `maquette/index.html` dans ton navigateur | Copie de référence (la vraie maquette à modifier est dans Claude Design) + à mettre dans ton repo pour Claude Code |
| `PROMPT-DEMARRAGE.md` | Le message à coller pour lancer ta 1re conversation | Tu le copies-colles dans ton Projet Claude |

---

## Le principe : deux Claude, deux rôles

1. **Claude (claude.ai, dans un Projet) = ton chef d'orchestre.** Il ne code pas à ta place :
   il comprend ton business, il te pose les bonnes questions, il écrit les consignes pour
   Claude Code, il vérifie le résultat sur tes captures d'écran, il surveille la sécurité.
2. **Claude Code (dans ton terminal) = le développeur.** Il écrit le code.

Toi, tu fais le lien : tu copies les consignes du chef d'orchestre dans Claude Code, et tu
rapportes les réponses / questions de Claude Code au chef d'orchestre.

> 💡 Règle d'or : quand Claude Code te pose une question ou te demande une autorisation et que
> tu n'es pas sûre → tu la colles au chef d'orchestre et tu lui demandes quoi répondre.

---

## 🎨 ÉTAPE 1 — FINALISER TA MAQUETTE (avant tout le reste)

> **Règle d'or du projet : on ne code RIEN tant que la maquette n'est pas finie et validée.**
> Ni le site, ni la base de données, ni le paiement, ni les automatisations.
> Guillaume a appris ça à ses dépens : coder sans maquette = tout refaire 2 ou 3 fois.

Guillaume t'a préparé une **maquette de départ** dans Claude Design (lien partagé par lui).
Elle contient **6 écrans mobiles** qui forment le parcours de réservation complet :

1. **Accueil** — vidéo plein écran, preuve sociale, 3 portes d'entrée (première pose / remplissage / sourcils)
2. **Page prestation** — photos, fiche technique, sélecteur d'effet, bouton « voir les disponibilités » toujours visible
3. **Choix du créneau** — le jour, puis l'heure
4. **Votre rendez-vous** — récap, compléments, détail du prix (acompte 50 % / reste au studio)
5. **Acompte** — coordonnées + paiement
6. **Merci** — confirmation + « réservez déjà votre remplissage »

Il y a 2 pages dans le canvas : **Direction clinique** (le design proposé) et **Wireframe** (le squelette
en gris, pour comprendre la logique). **Tu travailles sur « Direction clinique ».**

💡 **Avant de commencer, crée ton Projet Claude** (étape 1 de l'installation plus bas, 5 min) et
colle le prompt de démarrage (étape 4). Ton chef d'orchestre t'accompagnera pour finir la maquette.

**C'est une BASE, pas le design final.** Tu la modifies toi-même, directement dans l'interface
(clique sur un texte pour le réécrire, sur un bloc pour changer sa couleur, ou demande à Claude
dans le chat du canvas : « remplace ce bloc par… », « mets la couleur de mon logo »…).

### Ta checklist maquette (tout doit être coché avant de passer au code)
- [ ] Photos et vidéos : **PAS maintenant.** Laisse les blocs gris de la maquette, on les
      remplacera au moment du code. Concentre-toi sur la structure et les textes.
- [ ] Mon **logo** et, si je veux, **mes couleurs** (la structure reste, la peau peut changer)
- [ ] Mes **vrais textes** : titre, « qui suis-je », descriptions, FAQ
- [ ] Le **[X]+ clientes** de l'accueil remplacé par mon vrai chiffre
- [ ] Mes **vrais prix, durées et compléments** (la carte « [complément à définir] »)
- [ ] Les valeurs du **diagnostic** (forme de l'œil, courbure…) et de la cartographie des cils = ce que je mesure vraiment
- [ ] Ma **politique de report / annulation** (le « report gratuit jusqu'au… »)
- [ ] Parcours testé en mode **Play** (le bouton ▶) : je clique du début à la fin comme une cliente
- [ ] **Validé par Guillaume** 👍

💡 Ne touche PAS à la structure du parcours (l'ordre des écrans, le bouton collé en bas, le
choix jour → heure, le récap avant paiement, l'acompte affiché clairement). C'est elle qui fait
convertir. Change la déco librement.

Quand tout est coché → tu passes à l'installation ci-dessous. Tes écrans deviennent alors la
**référence visuelle** que Claude Code devra reproduire à l'identique.

---

## Installation (30 minutes, une seule fois — APRÈS la maquette)

### Étape 1 — Créer le Projet Claude
1. Sur claude.ai → **Projets** → **Nouveau projet** → nom : « Refonte Exotic Beauty ».
2. Dans **Instructions du projet** : colle tout le contenu de `INSTRUCTIONS-PROJET.md`.
3. Dans **Fichiers du projet** : ajoute `HANDOFF-INSTITUT.md`, `PLAYBOOK-LECONS.md`,
   `DESIGN-PRINCIPES.md`, `AUDIT-SITE-ACTUEL.md`, `ETAT-PROJET.md`.

### Étape 2 — Brancher les CONNECTEURS (très important)
Les connecteurs permettent à Claude de **faire le gros du travail lui-même** au lieu de te
demander de cliquer partout : lire ta base de données, vérifier tes déploiements, préparer tes
automatisations WhatsApp, configurer Stripe…

Sur claude.ai → **Paramètres → Connecteurs**, connecte :
- ✅ **Supabase** (ta base de données : réservations, créneaux, prestations)
- ✅ **Vercel** (l'hébergement : voir si le site est en ligne, lire les erreurs)
- ✅ **Stripe** (les paiements d'acompte)
- ✅ **Make** (les automatisations WhatsApp)
- ✅ **GitHub** si disponible (ton code)
- Plus tard : **Meta Ads** (pour analyser tes pubs)

Puis active-les dans ton Projet. Claude te demandera toujours ta validation avant de
**modifier** quelque chose — il peut lire librement, mais il ne touche à rien sans ton accord.

### Étape 3 — Mettre les fichiers dans ton code
À la racine de ton projet (le dossier de ton site), dépose : `CLAUDE.md`, `HANDOFF-INSTITUT.md`,
`PLAYBOOK-LECONS.md`, `DESIGN-PRINCIPES.md`, `ETAT-PROJET.md`.
Claude Code lira `CLAUDE.md` automatiquement à chaque session.

Ajoute aussi ta **maquette finalisée** : dans Claude Design, menu **Share › Export**, exporte
tes écrans (HTML, ou images si c'est plus simple) et range-les dans un dossier `maquettes/` à la
racine du projet. Envoie aussi des captures des 6 écrans à ton chef d'orchestre (Projet Claude).

### Étape 4 — Première conversation
Ouvre une conversation dans ton Projet et écris simplement :

Colle le prompt de démarrage (il est aussi dans `PROMPT-DEMARRAGE.md`).

Le chef d'orchestre va d'abord t'aider à **finaliser ta maquette**, puis te poser ses
questions **par petits blocs** (horaires, acompte, annulation, remplissage…). Réponds
simplement, avec tes mots. Il mettra à jour `ETAT-PROJET.md` au fur et à mesure.

---

## ⚠️ Les 3 règles de sécurité à ne JAMAIS oublier

1. **Les clés secrètes ne passent jamais dans le chat.** Tout ce qui commence par `sk_`,
   `sb_secret_`, `whsec_`, les tokens… tu les colles **toi-même** dans le fichier `.env.local`
   ou dans Vercel (en cochant « Sensitive »). Les clés publiques (`pk_`, URL Supabase) sont OK.
2. **On reste en mode TEST Stripe** jusqu'à ce que tout soit validé de bout en bout.
3. **On ne supprime jamais rien** (base de données, fichiers) sans que le chef d'orchestre
   t'ait expliqué ce qui va disparaître et que tu aies validé.

---

## Dans quel ordre on avance (vue d'ensemble)

1. **Maquette finalisée et validée** ← TU ES ICI (voir plus haut)
2. Onboarding avec ton chef d'orchestre + comptes + connecteurs
3. Site vitrine (accueil + pages prestations) fidèle aux maquettes
4. Moteur de créneaux (Supabase) + mini-admin pour bloquer tes créneaux
5. Paiement de l'acompte (Stripe, mode test)
6. Automatisations WhatsApp + e-mail (Make + Whapi + Resend)
7. Tracking Meta (Pixel + Conversions API) + bandeau cookies
8. Mise en ligne : domaine, Stripe en live, test réel, **fermeture de Planity**
9. Pubs Meta 🚀

Une étape à la fois. Chaque étape se teste sur ton iPhone avant de passer à la suivante.
