-- ═══════════════════════════════════════════════════════════════════════════
-- הזמנות חד-פעמיות לרישום לחלוקת חגים.
--
-- הצורך: הרישום נסגר, ומגיעה משפחה שצריכה להירשם בכל זאת — פנייה טלפונית,
-- מקרה חריג, טעות שהתגלתה. עד היום האפשרות היחידה הייתה לפתוח את הרישום
-- לכולם ולסגור מיד, וזה פותח את *כל* הערוצים לכל העולם למשך אותן דקות.
--
-- 🔴 הקישור הזה עוקף את הסגירה עבור משפחה אחת וחלוקה אחת בלבד — הוא אינו
-- פותח את הרישום, אינו נראה לאיש אחר, ואינו משנה את מתג המחלקה.
--
-- ⚠️ החד-פעמיות אינה "נחמד שיהיה" אלא הלב: קישור שנשלח במייל עובר הלאה,
-- נשמר בהיסטוריה, ומועבר לקרובים. בלי מימוש חד-פעמי הוא הופך לדלת פתוחה
-- לכל מי שקיבל אותו. המימוש נאכף בעדכון מותנה (used_at is null) ולא בקריאה
-- ואז כתיבה — שתי לחיצות במקביל היו עוברות שתיהן.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.distribution_invites (
  token           text primary key,

  -- ── מה הקישור מתיר, ולמי. שני אלה הם גבול ההרשאה. ──
  distribution_id uuid not null references public.distributions(id) on delete cascade,
  -- ⚠️ ההזמנה נעולה למשפחה מסוימת ולא "למי שיפתח". קישור פתוח שנשלח לאחד
  -- ומועבר לאחר היה רושם את הלא-נכון, ואין דרך לדעת בדיעבד שזה קרה.
  beneficiary_id  uuid not null references public.beneficiaries(id) on delete cascade,

  -- ── מעקב ──
  created_by      uuid,                    -- איש הצוות ששלח
  created_at      timestamptz not null default now(),
  -- ⚠️ תפוגה חובה, גם אם ארוכה. קישור נצחי הוא חור קבוע במתג הסגירה, וכזה
  -- שאיש לא זוכר שקיים.
  expires_at      timestamptz not null default (now() + interval '14 days'),

  -- ── המימוש. used_at is null = טרם מומש. ──
  used_at         timestamptz,
  used_ip         text,
  -- הרישום שנוצר בפועל — כדי שתמיד יהיה ברור מה הקישור הזה עשה.
  recipient_id    uuid references public.distribution_recipients(id) on delete set null,

  -- ביטול יזום לפני מימוש (נשלח בטעות / למשפחה הלא נכונה).
  revoked_at      timestamptz,
  revoked_by      uuid
);

-- "אילו הזמנות פתוחות יש לחלוקה הזו" — התצוגה במסך החלוקה.
create index if not exists distribution_invites_open
  on public.distribution_invites (distribution_id, created_at desc)
  where used_at is null and revoked_at is null;

-- "האם כבר שלחנו למשפחה הזו" — למניעת שליחה כפולה.
create index if not exists distribution_invites_beneficiary
  on public.distribution_invites (beneficiary_id, created_at desc);

alter table public.distribution_invites enable row level security;
-- ⚠️ ללא policies: service-role בלבד. הטוקן *הוא* ההרשאה, ולכן חשיפת הטבלה
-- ללקוח הייתה שקולה לחשיפת כל הקישורים הפתוחים.
