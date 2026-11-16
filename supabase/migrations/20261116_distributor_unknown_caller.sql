-- הודעות מוקלטות ממתקשר לא מזוהה בשלוחת המפיצים: פנייה בלי מפיץ, עם מספר הטלפון (אם נמסר)
alter table public.gilyonot_distributor_events alter column distributor_id drop not null;
alter table public.gilyonot_distributor_events add column if not exists caller_phone text;
