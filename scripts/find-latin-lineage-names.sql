-- ═══════════════════════════════════════════════════════════════════════════
-- A6.3: דוח כרטסות שיש בשמות הדורות שלהן אותיות לועזיות — קריאה בלבד.
--
-- 🔴 הרקע: אצל זלצמן נשמר בדור 8 "gyhk rcev" (עברית שהוקלדה במקלדת אנגלית).
-- מ-24.11 השרת חוסם שמות כאלה (latinChainError ב-lib/lineageChainEdit.ts),
-- אבל מה שכבר נשמר נשאר. הדוח מאתר אותם לתיקון ידני — הוא לא משנה דבר.
--
-- נבדקים lineage_chain (שם בכל דור) ו-lineage_manual (שמות שהוזנו ידנית).
-- ═══════════════════════════════════════════════════════════════════════════
set default_transaction_read_only = on;

with hits as (
  select b.id, b.full_name, b.spouse_name, b.id_number, b.spouse_id_number,
         'chain'::text as source, (g->>'generation')::int as generation, g->>'name' as name
  from beneficiaries b, jsonb_array_elements(b.lineage_chain) g
  where jsonb_typeof(b.lineage_chain) = 'array' and g->>'name' ~ '[A-Za-z]'
  union all
  select b.id, b.full_name, b.spouse_name, b.id_number, b.spouse_id_number,
         'manual', null, m
  from beneficiaries b, jsonb_array_elements_text(b.lineage_manual) m
  where jsonb_typeof(b.lineage_manual) = 'array' and m ~ '[A-Za-z]'
)
select id, full_name, spouse_name, id_number, spouse_id_number,
       string_agg(source || coalesce(' דור ' || generation, '') || ': ' || name, ' | ' order by generation) as latin_names
from hits
group by id, full_name, spouse_name, id_number, spouse_id_number
order by full_name;
