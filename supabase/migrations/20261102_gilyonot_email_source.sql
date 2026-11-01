-- גיליונות: מקור הרשמה חדש "email" (מייל נכנס ל-gilyonot@). קוד: lib/gilyonotInbound.ts
alter table public.gilyonot_subscribers drop constraint if exists gilyonot_subscribers_source_check;
alter table public.gilyonot_subscribers add constraint gilyonot_subscribers_source_check
  check (source in ('web','nedarim','manual','import','email'));
