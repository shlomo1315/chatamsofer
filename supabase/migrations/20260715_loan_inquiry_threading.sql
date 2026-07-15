-- ─────────────────────────────────────────────────────────────────────────────
-- שרשור מיילים בבירור הלוואה.
--
-- מטרה: הודעות ההמשך שאנו שולחים למבקש יגיעו כ*תשובה באותו שרשור* במייל שלו
-- (In-Reply-To / References), ולא כמייל חדש נפרד בכל פעם.
--
-- לשם כך שומרים על כל תשובה של המבקש שנקלטת מהמייל:
--   message_id       — ה-Message-ID האמיתי של הודעת המבקש (מכותרות המייל הנכנס).
--   references_chain  — שרשרת ה-References שהמבקש שלח (כל מזהי ההודעות עד כה).
--
-- כששולחים הודעת המשך, מתייחסים לתשובה האחרונה של המבקש: In-Reply-To = ה-message_id
-- שלה, ו-References = references_chain + message_id. כך לקוח המייל של המבקש משרשר
-- את ההודעה תחת אותה שיחה.
--
-- שם העמודה references_chain (ולא references) — כי references היא מילה שמורה ב-SQL.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.loan_messages
  add column if not exists message_id       text,
  add column if not exists references_chain  text;
