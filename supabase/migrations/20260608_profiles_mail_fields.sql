alter table profiles
  add column if not exists mail_account text,
  add column if not exists mail_label_ids text[] default '{}';
