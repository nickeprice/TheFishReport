-- 2026-10-02 — Weight-setup column (Sliding / Fixed) for the catch log.
--
-- WHY: anglers choose between a sliding weight (free on the mainline) and a
-- weight fixed at a 3-way swivel. The choice affects presentation, and recording
-- it on every catch lets the community sonar differentiate the two rigging styles.
--
-- Idempotent: column is ADDed only if it does not already exist.

ALTER TABLE public.catches ADD COLUMN IF NOT EXISTS weight_setup text;

-- Verify (read-only, no rows returned on success):
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'catches' AND column_name = 'weight_setup';