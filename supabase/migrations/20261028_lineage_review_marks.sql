-- סימון "נבדקה, תקין" לסקירת משפחה-משפחה במרכז הבקרה של עץ הדורות.
alter table public.beneficiaries
  add column if not exists lineage_reviewed_at timestamptz,
  add column if not exists lineage_reviewed_by text;

comment on column public.beneficiaries.lineage_reviewed_at is
  'מתי נסקרה המשפחה במרכז הבקרה של העץ וסומנה תקינה.';
comment on column public.beneficiaries.lineage_reviewed_by is
  'מי סימן את המשפחה כתקינה במרכז הבקרה (אימייל).';
