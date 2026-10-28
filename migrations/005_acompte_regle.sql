-- 005 — Acompte déjà réglé par la cliente (pour les rendez-vous ajoutés à la main)
-- À exécuter À LA MAIN dans Railway → Postgres → Database → Query.
-- Copier-coller le bloc ci-dessous, puis Entrée.
-- Sans risque : ajoute une colonne à 0 par défaut, ne modifie aucune réservation, peut être relancé.

-- Montant déjà réglé par la cliente, en centimes (0 = rien réglé d'avance).
-- Pour les RDV ajoutés à la main uniquement ; les RDV payés en ligne gardent leur acompte Stripe.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid_cents integer NOT NULL DEFAULT 0;

-- Vérification (facultative) : doit afficher la colonne paid_cents.
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'paid_cents';
