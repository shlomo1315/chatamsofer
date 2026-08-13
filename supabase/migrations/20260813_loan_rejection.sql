-- ═══════════════════════════════════════════════════════════════════════════
-- סיבת דחייה להלוואה.
--
-- 🔴 הצורך: משפחה שנדחתה מגישה שוב, והמזכירות פותחת את הבקשה החדשה בלי
-- לדעת שכבר נדחתה — ובלי לדעת למה. היא מטפלת בה מאפס, ולעיתים מאשרת בקשה
-- שנדחתה בכוונה מסיבה שעדיין תקפה.
--
-- ⚠️ rejection_reason קיים על beneficiaries אבל לא על loans: שם הוא מסביר
-- למה *המשפחה* אינה זכאית, וכאן למה *הבקשה הזו* נדחתה. אלה שתי שאלות שונות
-- לגמרי — משפחה זכאית לחלוטין יכולה להגיש בקשה שנדחית.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.loans
  add column if not exists rejection_reason text,
  add column if not exists rejected_at      timestamptz,
  add column if not exists rejected_by      text;

-- "האם למשפחה הזו יש דחיות קודמות" — השאלה שנשאלת בכל פתיחת בקשה חדשה.
-- ⚠️ אינדקס חלקי: רק דחיות. שאר הסטטוסים אינם רלוונטיים לשאילתה הזו,
-- והכללתם הייתה מנפחת את האינדקס פי כמה בלי תועלת.
create index if not exists loans_rejected_by_beneficiary
  on public.loans (beneficiary_id, rejected_at desc)
  where status = 'rejected';
