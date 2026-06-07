CREATE TABLE IF NOT EXISTS public.widow_requests (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiary_id UUID    NOT NULL REFERENCES public.beneficiaries(id) ON DELETE CASCADE,
  request_type   TEXT    NOT NULL CHECK (request_type IN ('financial','food','general')),
  description    TEXT,
  amount         NUMERIC,
  status         TEXT    NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','in_progress','approved','rejected')),
  notes          TEXT,
  reviewed_by    UUID,
  reviewed_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.widow_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON public.widow_requests USING (true);

CREATE INDEX IF NOT EXISTS widow_requests_beneficiary_idx ON public.widow_requests(beneficiary_id);
CREATE INDEX IF NOT EXISTS widow_requests_status_idx ON public.widow_requests(status);
