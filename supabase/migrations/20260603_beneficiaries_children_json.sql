ALTER TABLE public.beneficiaries
  ADD COLUMN IF NOT EXISTS children jsonb;
