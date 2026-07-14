-- ─────────────────────────────────────────────────────────────────────────────
-- תוית "צ'אט" למיילים נכנסים.
--
-- תשובת מבקש בבירור הלוואה מוצגת בשרשור שבתיק ההלוואה — אין סיבה שתציף
-- גם את הדואר הנכנס. כשהזיהוי מצליח היא בכלל לא נשמרת כאן; אבל כשהוא
-- נכשל (או נכשל בעבר), עדיף שהמייל יישב תחת תווית נפרדת מאשר בתיבה
-- הראשית.
-- ─────────────────────────────────────────────────────────────────────────────
alter table inbound_emails
  add column if not exists is_chat boolean not null default false;

create index if not exists inbound_emails_chat_idx on inbound_emails(is_chat) where is_chat;

-- מיילים קיימים שהם למעשה תשובות בירור — מסמנים למפרע.
update inbound_emails
   set is_chat = true
 where subject ilike '%הודעה מגמ%'
    or subject ilike '%בקשת ההלוואה%';
