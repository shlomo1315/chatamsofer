-- Add status column: 'verified' (green) | 'pending' (orange)
-- Existing nodes default to 'verified'; new nodes default to 'pending'
ALTER TABLE public.lineage_nodes
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'verified'
  CHECK (status IN ('verified', 'pending'));
