ALTER TABLE public.beneficiaries
  ADD COLUMN IF NOT EXISTS spouse_phone text;
