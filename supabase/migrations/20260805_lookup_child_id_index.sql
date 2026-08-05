-- ─────────────────────────────────────────────────────────────────────────────
-- חיפוש ת"ז של ילד — בלי סריקת טבלה מלאה.
--
-- ⚠️ הבעיה: שלב הזיהוי (api/portal/lookup) בודק אם הת"ז שהוזנה שייכת לילד
-- הרשום אצל משפחה כלשהי. הבדיקה נעשתה בשליפת *כל* המשפחות שיש להן ילדים
-- ובסריקתן בזיכרון — כלומר סריקת טבלה מלאה בכל חיפוש שאינו מוצא מוטב.
--
-- זה בדיוק המקרה הנפוץ: כל נרשם חדש נופל בו. ביום רישום המוני, עם אלפי
-- חיפושים, זה מכפיל את העומס על בסיס הנתונים פי מספר המשפחות שבמאגר.
--
-- הפתרון: פונקציה IMMUTABLE שמחלצת את ת"ז הילדים בצורה מנורמלת (ספרות בלבד,
-- בדיוק כמו הנרמול בצד ה-JS), אינדקס GIN עליה, ופונקציית RPC שמשתמשת בהם.
-- ─────────────────────────────────────────────────────────────────────────────

-- ת"ז הילדים של רשומה, מנורמלות לספרות בלבד.
-- ⚠️ חייבת להיות IMMUTABLE — אחרת Postgres יסרב לבנות עליה אינדקס.
create or replace function public.beneficiary_child_ids(children jsonb)
returns text[]
language sql
immutable
as $$
  select coalesce(
    array_agg(regexp_replace(c.value->>'id_number', '\D', '', 'g'))
      filter (where nullif(regexp_replace(coalesce(c.value->>'id_number', ''), '\D', '', 'g'), '') is not null),
    '{}'::text[]
  )
  from jsonb_array_elements(
    case when jsonb_typeof(children) = 'array' then children else '[]'::jsonb end
  ) as c
$$;

comment on function public.beneficiary_child_ids(jsonb) is
  'ת"ז הילדים ברשומה, מנורמלות לספרות בלבד. משמשת את האינדקס ואת lookup_beneficiary_by_child_id.';

-- האינדקס שהופך את החיפוש למיידי במקום סריקה מלאה.
create index if not exists beneficiaries_child_ids_gin_idx
    on public.beneficiaries
 using gin (public.beneficiary_child_ids(children));

-- איתור המשפחה שאצלה רשום ילד עם הת"ז הנתונה.
-- מחזירה גם את אובייקט הילד עצמו, כדי שהקורא לא יצטרך לסרוק שוב בצד השרת.
--
-- ⚠️ הסינון הראשון (@>) הוא זה שמשתמש באינדקס; הבדיקה השנייה מזהה *איזה*
-- מהילדים ברשומה תואם. בלי הראשון תתבצע סריקה, ובלי השני נחזיר ילד שגוי
-- כשלמשפחה כמה ילדים.
create or replace function public.lookup_beneficiary_by_child_id(p_id text)
returns table (
  id text,
  full_name text,
  family_name text,
  lineage_node_id text,
  lineage_chain jsonb,
  child jsonb
)
language sql
stable
as $$
  select b.id::text,
         b.full_name,
         b.family_name,
         b.lineage_node_id::text,
         b.lineage_chain,
         c.value
    from public.beneficiaries b
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(b.children) = 'array' then b.children else '[]'::jsonb end
    ) as c
   where public.beneficiary_child_ids(b.children) @> array[p_id]
     and regexp_replace(coalesce(c.value->>'id_number', ''), '\D', '', 'g') = p_id
   limit 1
$$;

comment on function public.lookup_beneficiary_by_child_id(text) is
  'המשפחה שאצלה רשום ילד עם הת"ז הנתונה, יחד עם אובייקט הילד. נשענת על beneficiaries_child_ids_gin_idx.';
