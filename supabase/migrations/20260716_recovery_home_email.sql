-- כתובת מייל לכל בית החלמה — לשליחת דיווחים / סיכום חודשי / הודעות.
alter table public.recovery_homes
  add column if not exists report_email text;
