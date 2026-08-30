-- ─────────────────────────────────────────────────────────────────────────────
-- ת"ז בנות 8 ספרות — האפס המוביל נבלע.
--
-- 🔴 ת"ז ישראלית היא 9 ספרות עם אפסים מובילים. שדה שעבר דרך אקסל מאבד
-- אותם ("01460773" נשמר כ-"1460773"), והרשומה נפסלת בכל ולידציה — כולל
-- בטפסים שדורשים ת"ז תקינה.
--
-- ⚠️ מתוקנות רק רשומות שבהן הוספת האפס מייצרת ת"ז שעוברת את **ספרת
-- הביקורת**. זו הוכחה ולא ניחוש: הסיכוי שספרת ביקורת תסתדר במקרה הוא
-- 1 ל-10. במדידה על המאגר, 125 מתוך 130 עומדות בתנאי.
--
-- ⚠️ חמש הנותרות אינן נוגעות — שם התיקון היה ניחוש, ות"ז שגויה גרועה
-- מת"ז חסרה: היא עלולה להתנגש ברשומה של משפחה אחרת.
--
-- 🔴 ומדוע נבדקת גם התנגשות: הריצה הראשונה נכשלה על
-- beneficiaries_id_number_key. התברר ששתי משפחות (יוזוק יוסף אשר,
-- גרינפלד מרדכי) רשומות *פעמיים* — פעם עם ת"ז מלאה ופעם עם הקצרה.
-- תיקון היה יוצר שתי רשומות באותה ת"ז. אלה כפילויות שדורשות מיזוג
-- ולא תיקון ת"ז, ולכן הן מדולגות.
--
-- ✅ הורצה 30.08.2026: 122 תוקנו (67 בעלים, 55 נשים). נותרו 8.
--
-- הגיבוי נשמר ב-id_fix_backup_20260830 עם הערך הישן והחדש, כדי שאפשר
-- יהיה לחזור:
--   update beneficiaries b set id_number = f.old_value
--     from id_fix_backup_20260830 f
--     where b.id = f.beneficiary_id and f.field = 'id_number';
-- ─────────────────────────────────────────────────────────────────────────────

-- ספרת הביקורת הישראלית (Luhn משוקלל 1,2,1,2...).
create or replace function il_id_valid(p text) returns boolean language plpgsql immutable as $$
declare s int := 0; d int; i int; w int;
begin
  if p is null or p !~ '^[0-9]{9}$' then return false; end if;
  for i in 1..9 loop
    d := substr(p, i, 1)::int;
    w := case when i % 2 = 1 then 1 else 2 end;
    d := d * w;
    if d > 9 then d := d - 9; end if;
    s := s + d;
  end loop;
  return s % 10 = 0;
end $$;

create table if not exists id_fix_backup_20260830 (
  beneficiary_id uuid,
  field text,
  old_value text,
  new_value text,
  fixed_at timestamptz not null default now()
);

insert into id_fix_backup_20260830 (beneficiary_id, field, old_value, new_value)
select id, 'id_number', id_number, '0' || id_number
from beneficiaries
where id_number ~ '^[0-9]{8}$' and il_id_valid('0' || id_number)
union all
select id, 'spouse_id_number', spouse_id_number, '0' || spouse_id_number
from beneficiaries
where spouse_id_number ~ '^[0-9]{8}$' and il_id_valid('0' || spouse_id_number);

-- ⚠️ ההשוואה לערך הישן מונעת דריסה אם המיגרציה תרוץ פעמיים.
update beneficiaries b set id_number = f.new_value, updated_at = now()
from id_fix_backup_20260830 f
where b.id = f.beneficiary_id and f.field = 'id_number' and b.id_number = f.old_value;

update beneficiaries b set spouse_id_number = f.new_value, updated_at = now()
from id_fix_backup_20260830 f
where b.id = f.beneficiary_id and f.field = 'spouse_id_number' and b.spouse_id_number = f.old_value;

-- בדיקה: מה תוקן, וכמה נשארו לבירור אנושי.
-- select field, count(*) from id_fix_backup_20260830 group by field;
