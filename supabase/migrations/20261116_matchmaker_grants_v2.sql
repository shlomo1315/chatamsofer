-- ── מלגות לשדכנים, שלב ב׳: חוג ובנק בהרשמה, שאלון מורחב, המתנה והגבלה פרטנית ──
-- חוזר בבטחה (if not exists). הגישה רק דרך service_role.

-- פרטי שדכן: חוג ופרטי העברה. מספר החשבון מוצפן; בנק וסניף אינם רגישים.
-- פרטי ההעברה נאספים בהרשמה ואינם ניתנים לעריכה על ידי השדכן (רק מנהל).
alter table public.matchmakers add column if not exists circle text;
alter table public.matchmakers add column if not exists bank_name text;
alter table public.matchmakers add column if not exists bank_branch text;
alter table public.matchmakers add column if not exists bank_account_enc text;
alter table public.matchmakers add column if not exists welcome_sent_at timestamptz;
-- הגבלה פרטנית: מספר בקשות מרבי לשדכן הזה (גובר על ההגדרה הכללית). null = לפי ההגדרה הכללית
alter table public.matchmakers add column if not exists claims_limit integer check (claims_limit is null or claims_limit >= 0);

-- בקשות: ת"ז נדרשת רק כשסומן צאצא החת"ס, ולכן נעשית אופציונלית
alter table public.matchmaker_claims alter column groom_id_enc drop not null;
alter table public.matchmaker_claims alter column groom_id_hash drop not null;
alter table public.matchmaker_claims alter column bride_id_enc drop not null;
alter table public.matchmaker_claims alter column bride_id_hash drop not null;

-- כל צד: אם ואב בנפרד (groom_father_name / groom_phone הקיימים הם האב), כתובת וחוג
alter table public.matchmaker_claims add column if not exists groom_mother_name text;
alter table public.matchmaker_claims add column if not exists groom_mother_phone text;
alter table public.matchmaker_claims add column if not exists groom_address text;
alter table public.matchmaker_claims add column if not exists groom_circle text;
alter table public.matchmaker_claims add column if not exists bride_mother_name text;
alter table public.matchmaker_claims add column if not exists bride_mother_phone text;
alter table public.matchmaker_claims add column if not exists bride_address text;
alter table public.matchmaker_claims add column if not exists bride_circle text;

-- שדכן נוסף (אם לא שדכן יחיד): {first_name,last_name,phone,city}
alter table public.matchmaker_claims add column if not exists second_matchmaker jsonb;
-- סיבות למלגה: {groom_over_24,bride_over_22,orphan:null|groom|bride,zivush_groom,zivush_bride,medical}
alter table public.matchmaker_claims add column if not exists reasons jsonb not null default '{}'::jsonb;
-- מפתח שידוך לפי שמות (כי אין ת"ז לכולם): אותו שידוך לא מוגש פעמיים
alter table public.matchmaker_claims add column if not exists pair_key text;
create unique index if not exists matchmaker_claims_pair_key_uq on public.matchmaker_claims (pair_key) where pair_key is not null;

-- הגדרות: מתי נפתחת הגשת בקשות ומספר ימי המתנה אחרי ההרשמה. ברירת מחדל: ה' בטבת תשפ"ז
alter table public.matchmaker_settings add column if not exists claims_open_from date;
alter table public.matchmaker_settings add column if not exists claim_wait_days integer not null default 7 check (claim_wait_days >= 0);
update public.matchmaker_settings set claims_open_from = date '2026-12-15' where id = 1 and claims_open_from is null;

grant all on public.matchmakers, public.matchmaker_login_codes, public.matchmaker_claims,
  public.matchmaker_settings, public.matchmaker_audit to service_role;

notify pgrst, 'reload schema';
