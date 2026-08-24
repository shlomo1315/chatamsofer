-- ─────────────────────────────────────────────────────────────────────────────
-- שרשור הבירור מול היולדת — מקביל ל-loan_messages.
--
-- 🔴 עד כה לא הייתה דרך לברר מול יולדת שהתיק שלה ממתין לאישור מנהל:
-- המזכיר היה שולח מייל מהתיבה הרגילה, והתשובה נעלמה מהתיק. עכשיו
-- ההתכתבות יושבת בתיק עצמו, כמו בהלוואות.
--
-- ⚠️ המבנה זהה במכוון ל-loan_messages: אותם שמות עמודות, אותו direction,
-- ואותם שדות מזהי-מייל (message_id / references_chain) שבזכותם התשובה
-- הנכנסת מזוהה ומוצמדת לשרשור הנכון.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.maternity_messages (
  id uuid primary key default gen_random_uuid(),
  aid_id uuid not null references public.maternity_aids(id) on delete cascade,
  -- 'staff' = נשלח מהמזכירות · 'applicant' = תשובת היולדת
  direction text not null check (direction in ('staff', 'applicant')),
  body text not null,
  sender_id uuid,
  sender_name text,
  -- ⚠️ ברירת מחדל false: הודעה נכנסת מסומנת כנקראה רק כשפותחים את
  -- השרשור, וזה מה שמפעיל את מונה ההתראות.
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  -- מזהי המייל — מאפשרים לחבר תשובה נכנסת לשרשור שלה
  message_id text,
  references_chain text,
  -- מסמך שצורף לתשובה
  attachment_url text,
  attachment_name text
);

create index if not exists maternity_messages_aid_id_idx
  on public.maternity_messages(aid_id, created_at);

-- ⚠️ אינדקס על message_id: קליטת התשובה מחפשת לפיו בכל מייל נכנס.
create index if not exists maternity_messages_message_id_idx
  on public.maternity_messages(message_id)
  where message_id is not null;

-- ── RLS ──
-- ⚠️ אין middleware במערכת וכל נתיב מגן על עצמו, אך RLS היא שכבת ההגנה
-- האחרונה: בלעדיה מפתח anon היה קורא את כל ההתכתבויות עם היולדות.
alter table public.maternity_messages enable row level security;

drop policy if exists "maternity_messages_staff_select" on public.maternity_messages;
create policy "maternity_messages_staff_select" on public.maternity_messages
  for select using (public.is_staff());

drop policy if exists "maternity_messages_staff_insert" on public.maternity_messages;
create policy "maternity_messages_staff_insert" on public.maternity_messages
  for insert with check (public.is_staff());

drop policy if exists "maternity_messages_staff_update" on public.maternity_messages;
create policy "maternity_messages_staff_update" on public.maternity_messages
  for update using (public.is_staff()) with check (public.is_staff());
