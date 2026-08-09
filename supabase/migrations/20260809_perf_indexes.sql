-- אינדקסים לשיפור ביצועים כלל-מערכתי (גל 3)
--
-- כל האינדקסים כאן הם create index if not exists — אין סיכון והרצה חוזרת בטוחה.
-- הם נבחרו לפי השאילתות החמות בפועל, לא לפי ניחוש.

-- 1. הרשימה הראשית של המוטבים — השאילתה הכי חמה במערכת.
--    האינדקס הקיים beneficiaries_special הוא חלקי (where is_special = true),
--    ולכן דווקא הרשימה הראשית — שמסננת is_special false/null — לא יכלה
--    להשתמש בו. האינדקסים החד-עמודתיים על eligibility_status ועל created_at
--    לא ניתנים לשילוב עבור סינון + מיון יחד.
--
--    ⚠️ אינדקס מלא ולא חלקי: הסינון בפועל הוא or(is_special.is.null,
--    is_special.eq.false), ותנאי OR לא מותאם אמין לפרדיקט של אינדקס חלקי.
create index if not exists beneficiaries_list_main_idx
  on public.beneficiaries (eligibility_status, created_at desc);

-- 2. מסמכים — הסינון מתחיל ב-doc_type ואז in(beneficiary_id, ...).
--    היה קיים אינדקס על beneficiary_id בלבד, כלומר העמודה המובילה לא תאמה.
create index if not exists documents_type_ben_idx
  on public.documents (doc_type, beneficiary_id);

-- 3. מוני המייל שלא נקראו — 11 שאילתות count כל 60 שניות לכל מנהל מחובר.
--    שלושה אינדקסים חד-עמודתיים חייבו bitmap-AND בכל אחת מהן.
create index if not exists inbound_emails_unread_idx
  on public.inbound_emails (to_email, is_read, is_spam);

-- 4. (dismissed_pending_tasks כבר מכוסה — המפתח הראשי שלה הוא בדיוק
--     (entity_type, entity_id), ואינדקס נוסף היה כפילות מיותרת.)

-- 5. יולדות — סינון סטטוס + מיון לפי מועד יצירה בשלושה מסכים.
create index if not exists maternity_aids_status_created_idx
  on public.maternity_aids (status, created_at desc);

-- 6. פרופילים לפי אימייל — נפילה-לאחור בכניסת Google, רצה ב-proxy על כל
--    בקשה ל-/admin. ilike בלי אינדקס = סריקת טבלה מלאה בכל ניווט.
create index if not exists profiles_email_lower_idx
  on public.profiles (lower(email));
