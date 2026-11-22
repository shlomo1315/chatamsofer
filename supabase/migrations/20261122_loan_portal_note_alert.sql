-- התראת הערת פורטל הביצוע למזכירות ההלוואות.
--
-- הערה שנכתבת בפורטל (/shared/loans) פותחת התראה: היא מהבהבת ברשימת
-- ההלוואות וקופצת בחלונית בכניסה לממשק, עד שמסמנים "טופל" או קובעים
-- מועד תזכורת ("לטיפול בהמשך").
--
-- portal_note_alert: 'open' = ממתינה לטיפול · 'handled' = טופלה · null = אין הערה
-- portal_note_remind_at: "לטיפול בהמשך" — ההתראה שקטה עד המועד הזה
-- בטוחה להרצה חוזרת.

alter table public.loans
  add column if not exists portal_note_at timestamptz,
  add column if not exists portal_note_alert text,
  add column if not exists portal_note_remind_at timestamptz,
  add column if not exists portal_note_handled_at timestamptz,
  add column if not exists portal_note_handled_by uuid;

-- הערות שכבר קיימות נפתחות כהתראה: אף אחד בניהול לא ראה אותן עד היום
-- (portal_note לא הוצג בשום מסך ניהול).
update public.loans
   set portal_note_alert = 'open',
       portal_note_at = coalesce(portal_note_at, updated_at, now())
 where portal_note is not null
   and btrim(portal_note) <> ''
   and portal_note_alert is null;

create index if not exists loans_portal_note_alert_open_idx
  on public.loans (portal_note_remind_at)
  where portal_note_alert = 'open';

comment on column public.loans.portal_note_alert is
  'התראת הערת פורטל לניהול: open = ממתינה, handled = טופלה, null = אין הערה';
comment on column public.loans.portal_note_remind_at is
  '"לטיפול בהמשך": ההתראה אינה קופצת עד המועד הזה';
