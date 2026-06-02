-- Fix: every UPDATE on lineage_nodes failed with
--   'record "new" has no field "updated_at"'  (HTTP 500)
--
-- Cause: the original migration used `create table if not exists`, so on a DB
-- where the table already existed without an updated_at column, the column was
-- never added — but the set_updated_at() trigger (which sets new.updated_at)
-- was still created. The trigger then fires on every UPDATE and fails.
--
-- This adds the missing column so the trigger works as originally intended.
ALTER TABLE public.lineage_nodes
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Make sure the auto-update trigger is in place and points at set_updated_at().
DROP TRIGGER IF EXISTS lineage_nodes_updated_at ON public.lineage_nodes;
CREATE TRIGGER lineage_nodes_updated_at
  BEFORE UPDATE ON public.lineage_nodes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Allow the 'rejected' status as well (original CHECK only permitted
-- verified/pending). Safe to run even if the constraint already allows it.
ALTER TABLE public.lineage_nodes
  DROP CONSTRAINT IF EXISTS lineage_nodes_status_check;
ALTER TABLE public.lineage_nodes
  ADD CONSTRAINT lineage_nodes_status_check
  CHECK (status IN ('verified', 'pending', 'rejected'));
