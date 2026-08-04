-- ─────────────────────────────────────────────────────────────────────────────
-- חלוקות חגים — אישור הבקשה ושיוך הכרטיס.
--
-- הרישום (שלב א') אינו זכאות: משפחה נרשמת, ואחר כך הצוות מאשר או דוחה. רק
-- משפחה מאושרת יכולה לשייך כרטיס, ולכן דרוש כאן מצב אישור *נפרד* מ-status.
--
-- ⚠️ למה לא להשתמש ב-status הקיים: status הוא מצב *הקבלה בפועל*
-- (pending / received / not_received) — האם המשפחה קיבלה את החלוקה. אישור
-- הבקשה הוא נתון אחר לגמרי, ומשפחה מאושרת שטרם קיבלה היא מצב תקין ושכיח.
-- דחיסת שני הנתונים לעמודה אחת הייתה מוחקת אחד מהם בכל עדכון של השני.
--
-- ⚠️ card_number נשמר על שורת הנרשם ולא על המשפחה: אותה משפחה מקבלת כרטיס אחר
-- בכל חלוקה, ושמירה על המשפחה הייתה דורסת את הכרטיס של החלוקה הקודמת ומאבדת
-- את התיעוד ההיסטורי.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.distribution_recipients
  -- מצב אישור הבקשה לחלוקה: pending | approved | rejected
  add column if not exists approval_status text not null default 'pending',
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid,
  add column if not exists rejected_reason text,
  -- 16 ספרות הכרטיס המגנטי ששויך למשפחה בחלוקה זו
  add column if not exists card_number text,
  -- שויך בהצלחה בנדרים (בלי זה הכרטיס "הוקש" אך אינו פעיל)
  add column if not exists card_linked_at timestamptz,
  -- סיבת הכשל המדויקת מנדרים — כדי שתהיה גלויה לצוות ולא רק ביומן
  add column if not exists card_link_error text,
  -- הטלפון שממנו שויך הכרטיס (הערוץ הטלפוני) — לתיעוד
  add column if not exists card_linked_phone text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.distribution_recipients'::regclass
      and conname = 'distribution_recipients_approval_status_chk'
  ) then
    alter table public.distribution_recipients
      add constraint distribution_recipients_approval_status_chk
      check (approval_status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

-- ⚠️ אותו כרטיס אינו יכול להיות משויך לשתי משפחות באותה חלוקה. בלי האינדקס הזה
-- טעות הקלדה בטלפון (ספרה אחת) הייתה מחברת לשתי משפחות את אותו כרטיס, ושתיהן
-- היו מושכות מאותה יתרה.
create unique index if not exists distribution_recipients_uniq_card
  on public.distribution_recipients(distribution_id, card_number)
  where card_number is not null;

-- שליפת "האם המשפחה מאושרת לחלוקה הפתוחה" — נעשית בכל שיחה טלפונית
create index if not exists distribution_recipients_approval_idx
  on public.distribution_recipients(distribution_id, approval_status);
