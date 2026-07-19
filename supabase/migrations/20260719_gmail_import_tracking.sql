-- מעקב הזרקה ל-Gmail (Workspace): מונע כפילות בהרצה חוזרת של הייבוא.
-- כל מייל ישן שהוזרק לתיבת ה-Gmail של המחלקה מסומן בחותמת זמן.
alter table public.inbound_emails
  add column if not exists imported_to_gmail_at timestamptz;

create index if not exists inbound_emails_gmail_import
  on public.inbound_emails (imported_to_gmail_at);
