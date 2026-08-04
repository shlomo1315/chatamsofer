-- ─────────────────────────────────────────────────────────────────────────────
-- אינדקסים לשחרור רישום המוני (טופס נדרים לאלפי נרשמים).
--
-- הרישום עושה כמה שאילתות לכל נרשם. שתיים מהן היו סריקות טבלה מלאות, ובנפח של
-- אלפי רישומים הן הופכות לצוואר הבקבוק האמיתי — לא הקוד ולא הרשת.
--
-- (1) אישור אוטומטי של שם דור: הרישום סופר בכמה שרשראות מופיע שם חדש, דרך
--     contains על lineage_chain (JSONB). בלי אינדקס GIN זו סריקה של *כל* טבלת
--     הצאצאים, לכל צומת חדש, בכל רישום.
-- (2) בדיקת כפילות ת"ז ומייל בכל רישום — צריכה להיות חיפוש אינדקס.
-- ─────────────────────────────────────────────────────────────────────────────

create index if not exists beneficiaries_lineage_chain_gin
  on public.beneficiaries using gin (lineage_chain jsonb_path_ops);

-- ⚠️ לא unique: כפילות ת"ז נחסמת בקוד עם הודעה מובנת למשתמש, ואילו אינדקס
-- ייחודי כאן היה מפיל רישום על שגיאת מסד גם במקרים שהצוות מטפל בהם ידנית
-- (למשל שתי רשומות היסטוריות שממתינות למיזוג).
create index if not exists beneficiaries_id_number_idx
  on public.beneficiaries(id_number);

create index if not exists beneficiaries_email_lower_idx
  on public.beneficiaries(lower(email))
  where email is not null;

-- רשימת הרחובות של עיר — נקראת באימות הכתובת בכל רישום
create index if not exists gov_streets_city_idx
  on public.gov_streets(city);
