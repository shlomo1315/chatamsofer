-- ─────────────────────────────────────────────────────────────────────────────
-- חלון רישום מתוזמן לחלוקת חגים — פתיחה וסגירה בתאריך ובשעה.
--
-- הרקע: הרישום נפתח ונסגר במתג ידני בלבד (registration_open). כלומר מי שרצה
-- לסגור את הרישום בחמישי ב-20:00 היה צריך להיות ליד המחשב בחמישי ב-20:00,
-- ומי ששכח — הרישום נשאר פתוח והצפי התקציבי המשיך לגדול אחרי הזמן.
--
-- ⚠️ שתי העמודות החדשות אינן מחליפות את המתג אלא *מצטרפות* אליו: המתג אומר
-- "החלוקה הזו היא הפעילה", והחלון אומר "ומתי בתוכה מקבלים רישומים". רישום
-- מתקבל רק כששניהם מתקיימים. כך מתג כבוי סוגר מיידית גם באמצע החלון —
-- וזו התנהגות הכרחית לעצירת חירום.
--
-- ⚠️ הבדיקה נעשית בזמן אמת בכל ניסיון רישום (lib/distributionSchedule), ולא
-- ע"י משימה מתוזמנת שמכבה את המתג. הסיבה: cron רץ במרווחים, ולכן תמיד יש
-- חלון שבו הרישום סגור לפי ההגדרה אך עדיין פתוח בפועל. בבדיקה בזמן אמת
-- הסגירה מדויקת לדקה, והיא חלה על *כל* הערוצים (אתר, נדרים, שלוחה טלפונית)
-- כי כולם נגזרים מ-getOpenDistribution.
--
-- ⚠️ timestamptz ולא timestamp: הערך נשמר ב-UTC ומוצג/נקלט בשעון המקומי.
-- עמודה בלי אזור זמן הייתה נשברת במעבר שעון קיץ — בדיוק בעונת החגים.
--
-- NULL = בלי הגבלה. שתיהן NULL → התנהגות זהה לקיים היום (מתג ידני בלבד),
-- ולכן המיגרציה אינה משנה דבר בחלוקות קיימות.
-- ▶ הרצה: Supabase → SQL Editor → Run. אידמפוטנטית.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.distributions
  add column if not exists registration_opens_at  timestamptz,
  add column if not exists registration_closes_at timestamptz;

comment on column public.distributions.registration_opens_at is
  'מועד פתיחת הרישום המתוזמנת. NULL = ללא הגבלה (נפתח עם המתג הידני). לפני המועד הזה הרישום סגור גם אם המתג דלוק.';
comment on column public.distributions.registration_closes_at is
  'מועד סגירת הרישום המתוזמנת. NULL = ללא הגבלה. אחרי המועד הזה הרישום סגור גם אם המתג דלוק.';

-- ⚠️ שמירה על שפיות החלון: סגירה חייבת להיות אחרי הפתיחה. בלי זה אפשר היה
-- לשמור חלון הפוך (סגירה לפני פתיחה) שמשמעותו "סגור תמיד" בלי שום חיווי.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'distributions_registration_window_check') then
    alter table public.distributions
      add constraint distributions_registration_window_check
      check (
        registration_opens_at is null
        or registration_closes_at is null
        or registration_closes_at > registration_opens_at
      );
  end if;
end $$;

-- שליפת החלוקה הפתוחה מסננת לפי המתג וממיינת לפי created_at; החלון נבדק
-- בצד השרת על השורה שנשלפה. אינדקס חלקי קטן על המתג משרת את השליפה הזו.
create index if not exists distributions_open_registration_idx
  on public.distributions (created_at desc)
  where registration_open = true;
