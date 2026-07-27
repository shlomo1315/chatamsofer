-- בחירת הטבות ליולדת: כרטיס מזון ו/או בית החלמה.
--
-- עד כה כל בקשת לידה קיבלה אוטומטית את שתי ההטבות. מעתה היולדת בוחרת מה
-- היא רוצה (כרטיס מזון, בית החלמה, או שתיהן). שני שדות בוליאניים נפרדים.
--
-- ⚠️ default true — כל הבקשות הקיימות נחשבות כ"רוצה את שתיהן", כלומר
-- ההתנהגות הנוכחית נשמרת בדיוק ושום בקשה קיימת לא נשברת.

alter table maternity_aids add column if not exists wants_food_card boolean not null default true;
alter table maternity_aids add column if not exists wants_recovery  boolean not null default true;

comment on column maternity_aids.wants_food_card is 'האם היולדת ביקשה כרטיס מזון (משפיע על שליחת שובר הכרטיס + דף ההנחיות)';
comment on column maternity_aids.wants_recovery  is 'האם היולדת ביקשה בית החלמה (משפיע על שליחת שובר ההבראה)';
