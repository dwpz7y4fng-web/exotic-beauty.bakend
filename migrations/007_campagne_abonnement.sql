-- Migration 007 — Campagne WhatsApp « Abonnement Regard libre » (Black Friday)
--
-- De quoi envoyer, UNE SEULE FOIS, un message d'annonce aux clientes via Whapi,
-- sans jamais écrire deux fois à la même personne (anti-doublon), et en excluant
-- celles qui demandent à ne plus être contactées (STOP).
--
-- À exécuter une fois à la main dans la console SQL de Railway.
-- Sans risque, réversible (les colonnes sont simplement ajoutées, vides).

ALTER TABLE clients ADD COLUMN IF NOT EXISTS campaign_abo_sent_at   timestamptz;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS campaign_abo_optout_at timestamptz;

-- Vérification (doit renvoyer les 2 colonnes) :
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'clients' AND column_name LIKE 'campaign_abo_%';
