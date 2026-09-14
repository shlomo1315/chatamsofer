-- ─────────────────────────────────────────────────────────────────────────────
-- 🔴 lineage_approved_ref — RLS מופעל אך *ללא אף מדיניות*.
--
-- התוצאה: כל קריאה שאינה service_role מחזירה 0 שורות **בשקט** (data=[],
-- error=null). הקוד ראה "הצלחה עם אפס שורות", inRef החזיר false לכל שם,
-- וכל דורות 2–5 נצבעו אדום אצל *כל* המשפחות — נראה כמו נתונים שגויים
-- ולא כמו תקלת הרשאות.
--
-- התגלה 14.09 אצל שרייבר דוד (039916333): דורות 2 ו-3 זהים תו-בתו לקובץ
-- המאושר, ובכל זאת נצבעו אדום.
--
-- אותה מדיניות בדיוק כמו על lineage_nodes: service_role בלבד. הטבלה נקראת
-- אך ורק מהשרת (getApprovedRefLookup), ואין סיבה לחשוף אותה ללקוח.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.lineage_approved_ref ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role full access" ON public.lineage_approved_ref;
CREATE POLICY "service role full access"
  ON public.lineage_approved_ref
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
