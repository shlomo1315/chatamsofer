-- ============ שיוך מייל נקלט לתיבה שממנה נמשך ============
-- עד היום מסך "סנכרון מייל" ספר מיילים לפי *מחלקה* (source='legacy' + department),
-- כי לא הייתה דרך לדעת מאיזו תיבה הגיע כל מייל. התוצאה: שתי תיבות שמשויכות
-- לאותה מחלקה הציגו כל אחת את הסכום של שתיהן — בדיוק במסך שאליו מסתכלים כדי
-- לוודא שחיבור חדש עבד. תיבה חדשה וריקה נראתה כאילו כבר נקלטו בה מאות מיילים.
--
-- העמודה נכתבת ע"י syncLegacyMail לכל מייל שנקלט מתיבה מזוהה. מיילים ישנים
-- שנקלטו לפני המיגרציה יישארו NULL — הספירה נופלת עבורם למצב הישן (לפי מחלקה).

alter table public.inbound_emails
  add column if not exists gmail_account_id uuid
    references public.gmail_accounts(id) on delete set null;

-- אינדקס לספירה פר-תיבה במסך הסטטוס
create index if not exists inbound_emails_gmail_account
  on public.inbound_emails (gmail_account_id)
  where gmail_account_id is not null;
