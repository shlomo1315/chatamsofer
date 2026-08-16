-- ─────────────────────────────────────────────────────────────────────────────
-- בקשת תיקון סדר דורות מהאזור האישי.
--
-- עד כה ההצעות היו אפשריות רק דרך קישור עם טוקן שהמזכירות שולחת
-- (lineage_share_invites). צאצא שראה טעות בייחוס שלו לא יכול היה להודיע
-- עליה, אלא אם המשרד פנה אליו קודם — והייחוס הוא מה שקובע זכאות.
--
-- ⚠️ token הוא not null עם foreign key, ולכן הצעה שמגיעה מהפורטל (שאין
-- לה טוקן) נכשלה בהכנסה. הוא הופך ל-nullable, וההרשאה במסלול הזה היא
-- סשן הפורטל במקום הטוקן.
-- ⚠️ beneficiary_id נוסף כדי לדעת מי ביקש: בלי טוקן אין recipient_name
-- להיתלות בו, והמנהל היה רואה הצעה בלי מקור.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.lineage_review_suggestions
  alter column token drop not null;

alter table public.lineage_review_suggestions
  add column if not exists beneficiary_id uuid references public.beneficiaries(id) on delete set null;

comment on column public.lineage_review_suggestions.token is
  'טוקן הקישור שדרכו הוגשה ההצעה. null = הוגשה מהאזור האישי (ראו beneficiary_id).';

-- "אילו בקשות תיקון הגיעו מהפורטל" — התצוגה במסך ההצעות של המנהל.
create index if not exists lineage_suggestions_from_portal
  on public.lineage_review_suggestions (created_at desc)
  where token is null;
