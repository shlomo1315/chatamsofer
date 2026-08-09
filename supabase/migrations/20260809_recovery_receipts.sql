-- קבלות מרובות לכל לידה — תשלום משלים מבית ההחלמה
--
-- הרקע: עד כה נשמרה קבלה אחת בלבד בעמודה maternity_aids.recovery_receipt_url,
-- והעלאת קבלה שנייה דרסה את הראשונה. כשיולדת האריכה את השהייה (למשל תכננה
-- לילה אחד והחליטה להישאר שניים), לבית ההחלמה לא הייתה שום דרך לגבות את
-- ההפרש — הרשומה כבר הייתה נעולה והקבלה הישנה נמחקה בכל ניסיון.
--
-- הפתרון: טבלת קבלות נפרדת. הקבלה הראשונה נשארת גם ב-recovery_receipt_url
-- (תאימות לאחור למסכי האדמין הקיימים), אך מקור האמת לסכום הוא הסכום המצטבר.

create table if not exists public.recovery_receipts (
  id           uuid primary key default gen_random_uuid(),
  aid_id       uuid not null references public.maternity_aids(id) on delete cascade,
  home         text not null,                -- שם בית ההחלמה שהגיש (תיעוד; לא FK)
  url          text not null,                -- קובץ הקבלה ב-bucket documents
  amount       numeric(10,2) not null default 0,
  nights       integer,                      -- לילות שהקבלה הזו מכסה (אופציונלי)
  note         text,                         -- הסבר בית ההחלמה ("לילה שני")
  is_initial   boolean not null default false, -- הקבלה שנוצרה בהגשה הראשונה
  created_at   timestamptz not null default now()
);

create index if not exists recovery_receipts_aid_idx on public.recovery_receipts(aid_id, created_at);

alter table public.recovery_receipts enable row level security;

-- הפורטל עובד ב-service role בלבד (כמו שאר מסלולי /api/portal), ולכן אין
-- policy ל-anon. קריאה מהאדמין נעשית גם היא דרך service role.
drop policy if exists "recovery_receipts service" on public.recovery_receipts;
create policy "recovery_receipts service" on public.recovery_receipts
  for all to service_role using (true) with check (true);

-- מיגרציית הקבלות הקיימות: כל רשומה שכבר יש לה קבלה מקבלת שורה ראשונה,
-- עם הסכום שכבר נרשם. כך הסכום המצטבר שווה למה שמוצג היום ואין קפיצה.
insert into public.recovery_receipts (aid_id, home, url, amount, nights, is_initial, created_at)
select a.id,
       coalesce(a.recovery_home, '—'),
       a.recovery_receipt_url,
       coalesce(a.recovery_amount, 0),
       a.recovery_nights,
       true,
       coalesce(a.recovery_amount_at, a.updated_at, now())
from public.maternity_aids a
where a.recovery_receipt_url is not null
  and a.recovery_receipt_url <> ''
  and not exists (select 1 from public.recovery_receipts r where r.aid_id = a.id);

-- דגל "יש תשלום משלים ממתין לידיעת המשרד" — מתאפס כשהמשרד מסמן שנצפה.
alter table public.maternity_aids
  add column if not exists recovery_topup_at timestamptz;

comment on column public.maternity_aids.recovery_topup_at is
  'מועד התשלום המשלים האחרון שהגיש בית ההחלמה (null = אין תשלום משלים)';
comment on table public.recovery_receipts is
  'קבלות בית ההחלמה — מרובות לכל לידה. recovery_amount הוא הסכום המצטבר שלהן.';
