-- ── גיליונות: אופן המשלוח. 'link' = קישור הורדה שנספר, 'attachment' = קובץ מצורף (ישנים, בלי נתוני הורדות) ──
alter table public.gilyonot_issues
  add column if not exists delivery_mode text not null default 'attachment' check (delivery_mode in ('link', 'attachment'));
