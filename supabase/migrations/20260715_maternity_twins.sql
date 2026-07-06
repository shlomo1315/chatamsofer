-- לידת תאומים + ימי זכאות לבית החלמה
--
-- is_twins              — האם מדובר בלידת תאומים (שני תינוקות בלידה אחת).
-- babies                — מערך כל התינוקות בלידה [{name, gender, id_type, id_number}].
--                         עבור לידה רגילה: תינוק אחד · עבור תאומים: שני תינוקות.
--                         העמודות baby_* ממשיכות להחזיק את התינוק הראשון (תאימות לאחור).
-- recovery_eligibility_days — מספר ימי הזכאות של היולדת בבית ההחלמה שאישרנו.
--                         ברירת המחדל: לידה רגילה = 2 · לידת תאומים = 4.
--                         ניתן לעריכה ידנית ע"י המזכירות (הוספה/הפחתה של ימים).

alter table public.maternity_aids
  add column if not exists is_twins                 boolean not null default false,
  add column if not exists babies                   jsonb,
  add column if not exists recovery_eligibility_days integer;

-- מילוי לאחור — כל הרשומות הקיימות (לידה רגילה) מקבלות 2 ימי זכאות.
update public.maternity_aids
  set recovery_eligibility_days = case when is_twins then 4 else 2 end
  where recovery_eligibility_days is null;

create index if not exists maternity_aids_is_twins_idx on public.maternity_aids(is_twins);
