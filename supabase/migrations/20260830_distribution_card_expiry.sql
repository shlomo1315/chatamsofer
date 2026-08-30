-- תוקף הכרטיס הנטען, לכל חלוקה בנפרד.
--
-- ⚠️ הקוד שקורא את העמודה (app/api/admin/holiday-load) כבר עלה לפרודקשן
-- בלי המיגרציה הזו. כשהעמודה חסרה השאילתה נכשלת, expiryIso נשאר null,
-- והכרטיסים נטענים *ללא תוקף* — בשקט מוחלט, בלי שגיאה במסך.
--
-- ⚠️ date ולא timestamptz: התוקף נשלח לנדרים כ-dd/MM/yyyy (ראו
-- toNedarimExpiry). שעה ואזור זמן היו מזיזים את היום בגבול חצות.
alter table public.distributions
  add column if not exists card_expiry date;

comment on column public.distributions.card_expiry is
  'תוקף הכרטיסים בחלוקה זו. NULL = הטענה ללא תוקף (התנהגות היסטורית).';
