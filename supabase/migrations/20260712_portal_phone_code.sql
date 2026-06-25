-- קוד כניסה חד-פעמי בשיחה טלפונית (צינתוק ימות) לפורטל הציבורי.
-- עמודות ייעודיות — נפרדות מאיפוס הסיסמה (portal_reset_*) כדי שלא יתנגשו.
alter table beneficiaries
  add column if not exists portal_phone_code_hash     text,
  add column if not exists portal_phone_code_expires  timestamptz,
  add column if not exists portal_phone_code_attempts integer not null default 0;
