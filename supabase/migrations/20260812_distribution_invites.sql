-- ═══════════════════════════════════════════════════════════════════════════
-- קישור רישום עם תוקף — לחלוקת חגים.
--
-- הצורך: הרישום נסגר, ועדיין צריך לאפשר לקבוצת משפחות להירשם — פנייה
-- טלפונית, מקרה חריג, טעות שהתגלתה. עד היום האפשרות היחידה הייתה לפתוח את
-- הרישום לכולם ולסגור מיד, וזה פותח את *כל* הערוצים (פורטל, שלוחה טלפונית,
-- נדרים, מייל) לכל העולם למשך אותן דקות.
--
-- 🔴 הקישור פותח את הרישום *רק בערוץ הפורטל*, ורק בתוך חלון הזמן שהוגדר לו.
-- הוא אינו נוגע במתג המחלקה, אינו משנה registration_open, ואינו פותח את
-- הערוצים האחרים.
--
-- ⚠️ קישור אחד משמש את כל מי שמקבל אותו — הוא במכוון אינו חד-פעמי ואינו נעול
-- למשפחה. לכן מה שמגן עליו הוא התוקף בלבד, וזו הסיבה שהתפוגה כאן היא עמודה
-- חובה ולא נוחות: קישור בלי תפוגה הוא מתג סגירה שנשאר פתוח לתמיד, וכזה
-- שאיש לא זוכר שקיים.
--
-- ⚠️ הזיהוי אינו נשען על הקישור. מי שפותח אותו עדיין מתחבר לפורטל בת"ז + קוד
-- חד-פעמי, ונרשם כמשפחה שלו בלבד. הקישור מסיר את חסימת הסגירה — לא את האימות.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.distribution_invites (
  token           text primary key,

  -- ── מה הקישור פותח ──
  -- ⚠️ נעול לחלוקה אחת, אחרת קישור שנשלח בפסח היה פותח רישום לתשרי.
  distribution_id uuid not null references public.distributions(id) on delete cascade,

  -- ── חלון הזמן — ההגנה היחידה על קישור שאינו חד-פעמי ──
  -- ⚠️ חובה. אין ברירת מחדל של "לתמיד".
  expires_at      timestamptz not null,
  -- פתיחה מושהית (אופציונלי): קישור שנשלח מראש ונפתח רק במועד.
  -- null = תקף מרגע היצירה.
  starts_at       timestamptz,

  -- ── ביטול יזום לפני התפוגה ──
  revoked_at      timestamptz,
  revoked_by      uuid,

  -- ── מעקב ──
  label           text,                    -- למה נוצר, לתצוגה במסך הניהול
  created_by      uuid,
  created_at      timestamptz not null default now(),
  -- כמה נרשמו דרכו בפועל. נספר בצד השרת, כדי שתמיד יהיה ברור מה הקישור עשה.
  used_count      integer not null default 0
);

-- "אילו קישורים פעילים יש לחלוקה הזו" — התצוגה במסך החלוקה.
create index if not exists distribution_invites_active
  on public.distribution_invites (distribution_id, created_at desc)
  where revoked_at is null;

alter table public.distribution_invites enable row level security;
-- ⚠️ ללא policies: service-role בלבד. הטוקן *הוא* מה שפותח את הרישום, ולכן
-- חשיפת הטבלה ללקוח הייתה שקולה לחשיפת כל הקישורים הפעילים.

-- ── מעקב אחר מי נרשם דרך קישור ──
-- ⚠️ בלי זה אי אפשר לדעת בדיעבד אילו רישומים נכנסו בזמן שהרישום היה סגור,
-- וזו בדיוק השאלה שתישאל כשמישהו יתהה איך משפחה נרשמה אחרי הסגירה.
alter table public.distribution_recipients
  add column if not exists invite_token text;

-- ── מונה השימושים ──
-- ⚠️ תוספת אטומית ולא קריאה-ואז-כתיבה: הקישור משותף, ושתי משפחות שנרשמות
-- באותו רגע היו דורסות זו את מונה זו ומדווחות מספר נמוך מהאמת.
create or replace function public.increment_invite_use(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.distribution_invites
     set used_count = used_count + 1
   where token = p_token;
$$;
