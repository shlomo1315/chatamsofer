-- ─────────────────────────────────────────────────────────────────────────────
-- תוויות סיבת אישור לאישורים חריגים.
--
-- הרקע: אישור חריג הוא אדם שאינו צאצא אך אושר להצטרף — למשל "משפחת שטרן".
-- עד כה הסיבה לאישור התקיימה רק בזיכרון של מי שאישר. כשבקשת הטבה של אדם
-- כזה מגיעה לטיפול, המזכיר רואה שם שאינו במאגר הצאצאים ואין לו דרך לדעת
-- אם מדובר בטעות או באישור מכוון, ובזכות מה.
--
-- ⚠️ טבלה נפרדת ולא עמודת טקסט חופשי: "משפחת שטרן" צריך להיכתב זהה בכל
-- הרשומות כדי שאפשר יהיה לסנן ולספור לפיו. טקסט חופשי היה מתפצל ל-
-- "שטרן", "משפ' שטרן" ו"משפחת שטרן " עם רווח, ושלושתם היו נראים כשלוש
-- קבוצות שונות.
--
-- ⚠️ תווית אחת לכל אדם (עמודה, לא טבלת קישור) — לפי ההחלטה שהתקבלה.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.approval_labels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- ⚠️ הצבע נשמר ולא נגזר מהשם: המשתמש מזהה קבוצה לפי הצבע שהוא בחר לה,
  -- וגזירה אוטומטית הייתה מחליפה צבעים בכל שינוי שם.
  color text not null default 'slate',
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

-- שם התווית ייחודי — שתי תוויות באותו שם הן בדיוק הבלבול שהטבלה נועדה למנוע.
-- ⚠️ lower() כדי ש"משפחת שטרן" ו"משפחת שטרן" בהבדל אותיות ייחשבו לאותה תווית.
create unique index if not exists approval_labels_name_uniq
  on public.approval_labels (lower(btrim(name)));

-- ─────────────────────────────────────────────────────────────────────────────
-- השיוך עצמו.
--
-- ⚠️ on delete set null ולא cascade: מחיקת תווית לא אמורה למחוק אנשים.
-- הם נשארים כאישור חריג בלי תווית, והמנהל יכול לשייך מחדש.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.beneficiaries
  add column if not exists approval_label_id uuid
    references public.approval_labels(id) on delete set null;

-- ⚠️ אינדקס חלקי — רק לרשומות שיש להן תווית. הרוב המוחלט של המאגר הוא
-- צאצאים רגילים בלי תווית, ואינדקס מלא היה גדול פי כמה בלי תועלת.
create index if not exists beneficiaries_approval_label_idx
  on public.beneficiaries (approval_label_id)
  where approval_label_id is not null;

-- ── RLS ──
-- ⚠️ קריאה לכל משתמש מאומת: התווית מוצגת בכרטסות ובקשות בכל המחלקות,
-- והמסננים שם כבר מגבילים מי רואה מה. הכתיבה עוברת דרך service role
-- בנתיבי ה-API בלבד (אין middleware — כל נתיב מאמת בעצמו).
alter table public.approval_labels enable row level security;

drop policy if exists approval_labels_read on public.approval_labels;
create policy approval_labels_read on public.approval_labels
  for select to authenticated using (true);

comment on table public.approval_labels is
  'תוויות סיבת אישור לאישורים חריגים — למשל "משפחת שטרן". מוצגות בכל בקשת הטבה.';
