-- הארכת זכאות ידנית ליולדת
-- ברירת המחדל: זכאות עד 6 שבועות מהלידה (six_weeks_end = תאריך הלידה + 42 יום).
-- במקרים חריגים ניתן להאריך ידנית את תאריך סיום הזכאות. six_weeks_end נשאר
-- תאריך סיום הזכאות *האפקטיבי* שכל הלוגיקה במורד הזרם נשענת עליו:
--   • פריקת כרטיס המזון האוטומטית בתום הזכאות (runUnloadExpired)
--   • פורטל בתי ההחלמה — סינון יולדות פעילות (api/portal/data)
--   • שלוחת ימות המשיח — בדיקת זכאות (webhooks/yemot-maternity)
--   • דוחות/סטטיסטיקות נדרים
-- הדגל eligibility_extended מסמן שהתאריך נקבע ידנית — כדי לא לדרוס אותו
-- בחישוב-מחדש בעת עריכת התיק, ולתצוגה נכונה ("הוארך ידנית" במקום "6 שבועות").
alter table public.maternity_aids
  add column if not exists eligibility_extended         boolean not null default false,
  add column if not exists eligibility_extended_at      timestamptz,
  add column if not exists eligibility_extended_by       uuid references public.profiles(id) on delete set null,
  add column if not exists eligibility_extension_reason text;
