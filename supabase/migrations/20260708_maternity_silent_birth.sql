-- לידות: זמינות בית החלמה (לכלל/שקטה/גם וגם) + סוג לידה (רגילה/שקטה)

-- זמינות בית החלמה: 'regular' = לכלל היולדות · 'silent' = רק לידה שקטה · 'both' = גם וגם
alter table recovery_homes
  add column if not exists availability text not null default 'regular';

-- סוג הלידה: 'live' = רגילה · 'silent' = לידה שקטה
alter table maternity_aids
  add column if not exists birth_type text not null default 'live';

create index if not exists maternity_aids_birth_type_idx on maternity_aids(birth_type);

-- מלון ירמיהו 33 — זמין רק ללידה שקטה
insert into recovery_homes (name, availability) values ('מלון ירמיהו 33', 'silent')
on conflict (name) do update set availability = excluded.availability;
