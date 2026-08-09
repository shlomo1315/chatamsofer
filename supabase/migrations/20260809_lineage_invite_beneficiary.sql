-- קישור תיקון סדר הדורות — מוזמן ברמת הצאצא, לא ברמת צומת בעץ
--
-- הרקע: הזמנות lineage_share_invites נוצרו עד כה רק ממסך העץ, אחרי שהמנהל
-- מאתר צומת וממקד אותו. אין דרך לשלוח לצאצא מסוים קישור מהכרטסת שלו, וגם
-- כשהקישור נשלח הנמען לא ראה את הפרטים של עצמו — רק צמתים בעץ.
--
-- שתי עמודות:
--   beneficiary_id — למי נשלח. מאפשר להציג לו את פרטיו בקישור, לקשר את
--                    ההצעות חזרה לכרטסת, ולמנוע שליחה כפולה.
--   mode           — 'full' (כל הפעולות, כמו היום) או 'order' (תיקון סדר
--                    הדורות בלבד). ברירת המחדל full כדי לא לשנות התנהגות
--                    של הזמנות קיימות שנוצרו ממסך העץ.

alter table public.lineage_share_invites
  add column if not exists beneficiary_id uuid references public.beneficiaries(id) on delete cascade,
  add column if not exists mode text not null default 'full';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lineage_share_invites_mode_check'
  ) then
    alter table public.lineage_share_invites
      add constraint lineage_share_invites_mode_check check (mode in ('full', 'order'));
  end if;
end $$;

create index if not exists lineage_share_invites_beneficiary
  on public.lineage_share_invites (beneficiary_id);

comment on column public.lineage_share_invites.beneficiary_id is
  'הצאצא שאליו נשלח הקישור (null = הזמנה שנוצרה ממסך העץ, ללא שיוך)';
comment on column public.lineage_share_invites.mode is
  'full = כל פעולות האישור · order = תיקון סדר הדורות בלבד';

-- מועד השליחה האחרון של קישור תיקון הדורות — להצגה בכרטסת ("נשלח ב...")
alter table public.beneficiaries
  add column if not exists lineage_link_sent_at timestamptz;

comment on column public.beneficiaries.lineage_link_sent_at is
  'מועד שליחת קישור תיקון סדר הדורות האחרון לצאצא';
