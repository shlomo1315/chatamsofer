-- ─────────────────────────────────────────────────────────────────────────────
-- מרכז בקשות המשפחות — מצבי עבודה לבקשות תיקון סדר הדורות.
--
-- 🔴 הרקע: 147 בקשות תיקון ממשפחות המתינו ללא טיפול, הוותיקה שלושה שבועות.
-- הסיבה המבנית כפולה:
--   1. הבקשות מהאזור האישי נשמרות כ-kind='note' (טקסט חופשי), ואישור של
--      note לא עשה *שום דבר* בעץ — המנהל נדרש לפענח מהמלל ולבנות ידנית
--      שרשרת של 8-9 דורות. בפועל אף אחד לא עשה זאת.
--   2. היו רק שני מצבים (pending/approved/rejected) ושום דרך לסמן "בדקתי,
--      צריך בירור" או "התחלתי לטפל" — ולכן אי אפשר היה לדעת מה כבר נבדק.
--
-- כאן נוספים המצבים החסרים בלבד. status הקיים נשמר כפי שהוא (pending/
-- approved/rejected) כדי לא לשבור את התיבה הקיימת ואת ה-API שלה.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── מצב עבודה מורחב ──
-- ⚠️ עמודה נפרדת ולא הרחבת status: status מתאר את גורל *ההצעה* (אושרה/
-- נדחתה), ואילו כאן מתואר מצב *הטיפול* (בבירור / סומן לחזרה). ערבובם היה
-- מחייב לגעת בכל מי שקורא את status היום.
alter table lineage_review_suggestions
  add column if not exists work_state text
    check (work_state in ('open', 'in_progress', 'waiting_family', 'later'))
    default 'open';

-- הערת המנהל לעצמו — "מה בדקתי ומה חסר".
alter table lineage_review_suggestions
  add column if not exists staff_note text;

-- מי נגע אחרון ומתי, גם בלי הכרעה סופית. ⚠️ מבדיל "אף אחד לא פתח את זה"
-- מ"מישהו בדק ולא סיים" — ההבחנה שבלעדיה אי אפשר לחלק עבודה.
alter table lineage_review_suggestions
  add column if not exists touched_by uuid;
alter table lineage_review_suggestions
  add column if not exists touched_at timestamptz;

-- ⚠️ הבקשה עשויה להתייחס למוטב שכבר נמחק; ON DELETE SET NULL ולא CASCADE,
-- כדי שהבקשה עצמה (וההיסטוריה שלה) לא תיעלם.
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'lineage_review_suggestions_touched_by_fkey'
  ) then
    alter table lineage_review_suggestions
      add constraint lineage_review_suggestions_touched_by_fkey
      foreign key (touched_by) references auth.users(id) on delete set null;
  end if;
end $$;

-- ── אינדקסים ──
-- הרשימה נטענת מסוננת לפי סטטוס וממוינת לפי ותק ("הכי מחכה קודם").
create index if not exists lineage_suggestions_status_created_idx
  on lineage_review_suggestions (status, created_at);

create index if not exists lineage_suggestions_work_state_idx
  on lineage_review_suggestions (work_state)
  where status = 'pending';

-- שליפת הבקשות של מוטב מסוים (כרטסת הצאצא).
create index if not exists lineage_suggestions_beneficiary_idx
  on lineage_review_suggestions (beneficiary_id);

-- ⚠️ שורות קיימות: work_state מקבל ערך רק לממתינות. בקשה שכבר הוכרעה
-- אינה "פתוחה" — הסטטוס שלה הוא הקובע.
update lineage_review_suggestions
set work_state = 'open'
where work_state is null and status = 'pending';
