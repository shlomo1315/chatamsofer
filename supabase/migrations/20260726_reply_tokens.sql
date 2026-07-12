-- מזהי מענה קצרים ל-plus-addressing.
--
-- הבאג: הטוקן החתום (HMAC) הוא ~156 תווים, וכתובת כמו
-- office+g<156-תווים>@chasamsofer.info נדחית ע"י Resend
-- (Invalid reply_to field).
--
-- הפתרון: מזהה קצר ואקראי (12 תווים) שנשמר כאן ומצביע על הלידה.
-- הכתובת הופכת ל-office+g<12-תווים>@... — קצרה ותקינה.
-- האקראיות (96 ביט) מונעת ניחוש, בדיוק כמו הטוקן החתום.

create table if not exists public.reply_tokens (
  token        text primary key,          -- 12 תווים אקראיים
  kind         text not null,             -- 'g' = מכתב ברכה | 's' = משוב
  entity_table text not null,
  entity_id    uuid not null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '90 days')
);

create index if not exists reply_tokens_entity
  on public.reply_tokens (kind, entity_table, entity_id);

alter table public.reply_tokens enable row level security;
-- service-role בלבד (אין policies) — הטוקנים לא נחשפים ללקוח
