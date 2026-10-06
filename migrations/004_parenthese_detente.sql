-- 004 — La « parenthèse détente » (zone de massage choisie par la cliente)
-- À exécuter À LA MAIN dans Railway → Postgres → Database → Query.
-- Copier-coller tout le bloc ci-dessous, puis Entrée.
-- Sans risque : ne supprime rien, ne modifie aucune réservation existante, peut être relancé.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS massage_zone text;

-- Vérification (facultative) : doit afficher la colonne
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'massage_zone';
