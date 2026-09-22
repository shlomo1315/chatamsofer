-- ═══════════════════════════════════════════════════════════════════════════
-- מחלקת "יריד ספרים" — קטלוג, מלאי דו-ערוצי, הזמנות וסליקה.
--
-- שני ערוצי מכירה על מאגר אחד: אתר ציבורי (app/fair) ומערכת טלפונית.
--
-- 🔴 המלאי מופרד קשיחות בין הערוצים: stock_web ו-stock_phone הן מכסות
-- נפרדות לחלוטין. נגמר באחד — השני ממשיך למכור. אין גלישה אוטומטית;
-- העברה בין הערוצים היא פעולה ידנית מפורשת (book_fair_move_stock).
-- זו הכרעת המשתמש, ולא מגבלה טכנית.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1) קטלוג הספרים
-- ───────────────────────────────────────────────────────────────────────────
--
-- 🔴 הכסף נשמר באגורות כמספר שלם — סטייה מודעת מ-numeric(10,2) שבשאר
-- המערכת (financial_aid_requests.amount, maternity_aids.recovery_amount).
--
-- הנימוק: numeric מגיע ל-JS דרך PostgREST כ*מחרוזת*, ובסיוע רפואי יש סכום
-- אחד לרשומה שאיש אינו מחבר. כאן מחברים עגלה של פריטים כפול כמות ועוד
-- משלוח, ואז משווים את התוצאה *לאגורה* מול מה שחברת הסליקה חייבה בפועל.
-- השוואת שלמים היא ודאית; השוואת float היא הזמנה לבאג שקט בכסף.
--
-- ⚠️ אל תשנה את זה ל-numeric. כל עמודת כסף כאן נושאת סיומת _agorot
-- מפורשת בדיוק כדי שלא תהיה אי-הבנה בקריאה.
create table if not exists public.book_fair_books (
  id            uuid primary key default gen_random_uuid(),
  sku           text not null,                                    -- מק"ט
  title         text not null,
  author        text,
  publisher     text,
  volumes       integer not null default 1 check (volumes > 0),   -- מספר כרכים
  price_agorot  integer not null check (price_agorot >= 0),
  image_path    text,                                             -- נתיב ב-storage, לא URL
  description   text,

  -- 🔴 שתי מכסות נפרדות. ה-check הוא רשת ביטחון אחרונה: הניכוי האטומי כבר
  -- מונע ירידה מתחת לאפס, וה-check הופך באג עתידי מכשל שקט לשגיאה רועשת.
  stock_web     integer not null default 0 check (stock_web >= 0),
  stock_phone   integer not null default 0 check (stock_phone >= 0),

  phone_code    integer,                                          -- קוד להקשה בשלוחה
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- מק"ט ייחודי ללא תלות ברישיות
create unique index if not exists book_fair_books_sku_uidx
  on public.book_fair_books (lower(sku));

-- ⚠️ ייחודיות חלקית — ספר ללא קוד טלפוני מותר (נמכר באתר בלבד).
-- אותו דפוס בדיוק כמו card_centers_code_uidx.
create unique index if not exists book_fair_books_phone_code_uidx
  on public.book_fair_books (phone_code) where phone_code is not null;

create index if not exists book_fair_books_active_idx
  on public.book_fair_books (is_active, sort_order);

-- ───────────────────────────────────────────────────────────────────────────
-- 2) ערי המשלוח — רשימה סגורה
-- ───────────────────────────────────────────────────────────────────────────
--
-- ⚠️ בכוונה אין כאן עמודת מחיר: התעריף נקבע לפי *כמות הספרים* בלבד
-- (book_fair_shipping_tiers), ולא לפי יעד. הוספת מחיר כאן לצורך עתידי
-- תיצור שני מקורות אמת לתמחור המשלוח.
--
-- הרשימה הסגורה היא גם אימות הכתובת: לקוח בוחר עיר מתוך הרשימה במקום
-- להקליד יעד חופשי שאיננו משלחים אליו.
create table if not exists public.book_fair_cities (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  phone_code  integer unique,                                     -- להקשה בשלוחה
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────────────────
-- 3) מדרגות המשלוח — לפי כמות ספרים
-- ───────────────────────────────────────────────────────────────────────────
--
-- ⚠️ max_books = null פירושו "ומעלה" (המדרגה העליונה). הגבולות כוללים
-- משני הצדדים. ולידציית אי-חפיפה ואי-פערים נעשית ב-lib/bookFairShipping.ts
-- ולא כאן — היא צריכה להיבדק ביחידה בלי מסד, ולהניב הודעה בעברית למסך.
create table if not exists public.book_fair_shipping_tiers (
  id            uuid primary key default gen_random_uuid(),
  min_books     integer not null check (min_books >= 0),
  max_books     integer check (max_books is null or max_books >= min_books),
  price_agorot  integer not null check (price_agorot >= 0),
  created_at    timestamptz not null default now()
);

create index if not exists book_fair_tiers_min_idx
  on public.book_fair_shipping_tiers (min_books);

-- ───────────────────────────────────────────────────────────────────────────
-- 4) הזמנות
-- ───────────────────────────────────────────────────────────────────────────
--
-- 🔴 סכומי ההזמנה *נצרבים* ואינם מחושבים מחדש משורות ההזמנה. אם מחיר ספר
-- יעודכן מחר בקטלוג, הזמנה מאתמול חייבת להישאר בסכום שנגבה בפועל — וזה גם
-- הסכום שמושווה מול תשובת הסליקה.
--
-- ⚠️ refunded_agorot הוא סכום ולא דגל בוליאני: זיכוי חלקי (ספר אחד מתוך
-- שלושה שאזל) הוא התרחיש הסביר ביותר, ובוליאני היה מכריח מיגרציה כואבת.
--
-- ⚠️ payment_mismatch הוא סטטוס נפרד ולא כשל: הכסף *כן* נגבה, אך בסכום
-- שאינו תואם להזמנה. הזמנה כזו לעולם אינה עוברת ל-paid אוטומטית — היא
-- עולה למסך הניהול להכרעת אנוש.
create table if not exists public.book_fair_orders (
  id                uuid primary key default gen_random_uuid(),
  order_number      text not null unique,                         -- BF-26-0417
  channel           text not null check (channel in ('web','phone')),
  status            text not null default 'pending_payment'
                      check (status in (
                        'pending_payment',    -- נוצרה, טרם שולמה
                        'payment_mismatch',   -- נגבה סכום שאינו תואם — לבדיקת אנוש
                        'paid',               -- שולם ואומת
                        'picking',            -- בליקוט
                        'packed',             -- נארז
                        'shipped',            -- נשלח
                        'delivered',          -- נמסר
                        'failed',
                        'cancelled',
                        'refunded',
                        'partially_refunded'
                      )),

  -- פרטי הלקוח
  customer_name     text,
  customer_phone    text,
  customer_email    text,

  -- משלוח
  delivery_method   text not null check (delivery_method in ('pickup','shipping')),
  city_id           uuid references public.book_fair_cities(id) on delete set null,
  address_text      text,                                         -- מה שהוקלד בפועל
  address_confirmed boolean not null default false,               -- אומת מול ההקלטה

  -- כסף (אגורות, ראו ההערה בראש הקובץ)
  items_total_agorot  integer not null default 0 check (items_total_agorot >= 0),
  shipping_agorot     integer not null default 0 check (shipping_agorot >= 0),
  total_agorot        integer not null default 0 check (total_agorot >= 0),
  refunded_agorot     integer not null default 0 check (refunded_agorot >= 0),

  tracking_token    text unique,                                  -- לקישור המעקב האישי
  notes             text,
  created_by        uuid references auth.users(id) on delete set null,  -- null = הזמנה עצמית
  paid_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists book_fair_orders_status_idx  on public.book_fair_orders (status);
create index if not exists book_fair_orders_channel_idx on public.book_fair_orders (channel);
create index if not exists book_fair_orders_created_idx on public.book_fair_orders (created_at desc);
create index if not exists book_fair_orders_phone_idx   on public.book_fair_orders (customer_phone);

-- ההזמנות שממתינות לאימות כתובת מההקלטה — התור שהמשרד עובד לפיו
create index if not exists book_fair_orders_addr_pending_idx
  on public.book_fair_orders (created_at desc)
  where delivery_method = 'shipping' and address_confirmed = false;

-- ───────────────────────────────────────────────────────────────────────────
-- 5) שורות ההזמנה
-- ───────────────────────────────────────────────────────────────────────────
--
-- 🔴 צילום מצב (snapshot) של השם והמחיר בעת הרכישה, ו-on delete set null
-- על הספר: מחיקת ספר מהקטלוג לעולם לא תמחק היסטוריית הזמנות ולא תשאיר
-- שורה בלי שם. אותו דפוס כמו 20260831_user_refs_set_null.sql.
create table if not exists public.book_fair_order_items (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.book_fair_orders(id) on delete cascade,
  book_id            uuid references public.book_fair_books(id) on delete set null,
  title_snapshot     text not null,
  sku_snapshot       text,
  volumes_snapshot   integer not null default 1,
  unit_price_agorot  integer not null check (unit_price_agorot >= 0),
  quantity           integer not null check (quantity > 0),
  line_total_agorot  integer not null check (line_total_agorot >= 0),
  created_at         timestamptz not null default now()
);

create index if not exists book_fair_items_order_idx on public.book_fair_order_items (order_id);
create index if not exists book_fair_items_book_idx  on public.book_fair_order_items (book_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 6) שריוני מלאי — לב מניעת מכירת היתר
-- ───────────────────────────────────────────────────────────────────────────
--
-- 🔴 ההכרעה המרכזית של כל המחלקה: המלאי נוכה כבר בשלב *השריון*, לא בשלב
-- התשלום. כלומר stock_web/stock_phone פירושם "זמין למכירה", ולא "קיים
-- במחסן". המלאי הפיזי = stock_web + stock_phone + סך השריונים הפעילים.
--
-- המשמעות: אין אף רגע שבו שני קונים מחזיקים את אותו עותק. המחיר הוא
-- שחייב להיות שחרור אמין — ולכן יש גם פקיעה עצלה וגם cron (ראו
-- book_fair_expire_reservations במיגרציית הפונקציות).
create table if not exists public.book_fair_reservations (
  id          uuid primary key default gen_random_uuid(),
  book_id     uuid not null references public.book_fair_books(id) on delete cascade,
  channel     text not null check (channel in ('web','phone')),
  quantity    integer not null check (quantity > 0),
  cart_token  text not null,                                      -- עגלה בדפדפן / שיחה בטלפון
  order_id    uuid references public.book_fair_orders(id) on delete set null,
  status      text not null default 'held'
                check (status in ('held','consumed','released','expired')),
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

-- ⚠️ אינדקסים *חלקיים* על held בלבד: הטבלה תתמלא בשורות היסטוריות
-- (consumed/expired), והשאילתות החמות — ניקוי פקועים וטעינת עגלה — נוגעות
-- רק בשריונים החיים.
create index if not exists book_fair_res_expiry_idx
  on public.book_fair_reservations (expires_at) where status = 'held';
create index if not exists book_fair_res_cart_idx
  on public.book_fair_reservations (cart_token) where status = 'held';
create index if not exists book_fair_res_book_idx
  on public.book_fair_reservations (book_id) where status = 'held';
create index if not exists book_fair_res_order_idx
  on public.book_fair_reservations (order_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 7) יומן תנועות המלאי
-- ───────────────────────────────────────────────────────────────────────────
--
-- ⚠️ היומן הוא *ראיה*, לא מקור אמת. מקור האמת הוא stock_web/stock_phone
-- על הספר עצמו — בניגוד ל-card_stock_ledger, שבו המלאי הוא SUM(delta).
--
-- הנימוק להבדל: שם יש מלאי גלובלי יחיד, וכאן מאות ספרים כפול שני ערוצים.
-- SUM בכל בדיקת זמינות בדף קטלוג הוא רצח ביצועים. במקום זה, מסך התאמת
-- מלאי ישווה בין השניים ויתריע על פער — כך באג בשחרור מתגלה במקום להיעלם.
create table if not exists public.book_fair_stock_ledger (
  id          uuid primary key default gen_random_uuid(),
  book_id     uuid references public.book_fair_books(id) on delete cascade,
  channel     text not null check (channel in ('web','phone')),
  delta       integer not null,                                   -- חיובי הוספה / שלילי הורדה
  reason      text not null check (reason in (
                'import','restock','reserve','release','consume',
                'move_in','move_out','adjust','refund'
              )),
  order_id    uuid references public.book_fair_orders(id) on delete set null,
  note        text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists book_fair_ledger_book_idx
  on public.book_fair_stock_ledger (book_id, created_at desc);
create index if not exists book_fair_ledger_created_idx
  on public.book_fair_stock_ledger (created_at desc);

-- ───────────────────────────────────────────────────────────────────────────
-- 8) ניסיונות ותוצאות סליקה
-- ───────────────────────────────────────────────────────────────────────────
--
-- 🔴 provider_response נשמר *אחרי סינון* (sanitizeProviderResponse ב-lib):
-- כל מפתח שנראה כמספר כרטיס, קוד אימות או תוקף מוסר לפני הכתיבה. שמירת
-- תשובת סליקה גולמית היא חשיפת פרטי אשראי בשורת מסד.
create table if not exists public.book_fair_payments (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.book_fair_orders(id) on delete cascade,
  provider          text not null default 'nedarim',
  amount_agorot     integer not null,
  status            text not null check (status in ('initiated','success','failed','refunded')),
  transaction_id    text,                                         -- המזהה אצל הספק
  provider_response jsonb,                                        -- מסונן, ראו למעלה
  error_message     text,
  created_at        timestamptz not null default now()
);

create index if not exists book_fair_payments_order_idx on public.book_fair_payments (order_id);

-- ⚠️ ייחודיות חלקית על מזהה העסקה: מגנה מפני עיבוד כפול של אותו callback.
-- ספקי סליקה שולחים את הדיווח שוב כשלא קיבלו תשובה מהר, וללא המחסום הזה
-- אותה עסקה הייתה מנוכה פעמיים מהמלאי ושולחת שני מיילים ללקוח.
create unique index if not exists book_fair_payments_txn_uidx
  on public.book_fair_payments (provider, transaction_id)
  where transaction_id is not null;

-- ───────────────────────────────────────────────────────────────────────────
-- 9) שיחות טלפון והקלטות
-- ───────────────────────────────────────────────────────────────────────────
--
-- ⚠️ הטבלה אגנוסטית לספק הטלפוניה: call_id הוא מזהה השיחה אצל הספק, יהא
-- אשר יהא. מכונת המצבים עצמה יושבת ב-lib ואינה יודעת דבר על הפרוטוקול.
create table if not exists public.book_fair_call_sessions (
  id          uuid primary key default gen_random_uuid(),
  call_id     text not null unique,                               -- מזהה השיחה אצל הספק
  phone       text,
  step        text not null default 'menu',
  state       jsonb not null default '{}'::jsonb,                 -- עגלה ובחירות
  cart_token  text not null,
  order_id    uuid references public.book_fair_orders(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists book_fair_calls_cart_idx on public.book_fair_call_sessions (cart_token);

-- ⚠️ storage_path בנוסף לנתיב אצל הספק, ובמכוון: ההקלטה היא מקור האמת מול
-- הלקוח לגבי כתובת המשלוח. מקור אמת שנשען על אחסון של ספק חיצוני שאנחנו
-- מוחקים ממנו קבצים אינו מקור אמת — ולכן נשמר עותק אצלנו.
--
-- ⚠️ transcript הוא *ניסיון* ויכול להישאר null. תמלול עברית על קו טלפון
-- שגוי לעיתים קרובות, ולכן האישור מול הלקוח נעשה על ההקלטה של קולו שלו
-- ולא על הטקסט. כשל תמלול לעולם אינו מפיל הזמנה.
create table if not exists public.book_fair_recordings (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid references public.book_fair_orders(id) on delete cascade,
  call_id           text,
  kind              text not null default 'address' check (kind in ('address','name','note')),
  provider_path     text,                                         -- הנתיב אצל ספק הטלפוניה
  storage_path      text,                                         -- העותק שלנו
  transcript        text,
  transcript_source text,                                         -- מי תמלל, null = לא תומלל
  duration_sec      integer,
  created_at        timestamptz not null default now()
);

create index if not exists book_fair_rec_order_idx on public.book_fair_recordings (order_id);
create index if not exists book_fair_rec_call_idx  on public.book_fair_recordings (call_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 10) עדכון updated_at אוטומטי
-- ───────────────────────────────────────────────────────────────────────────
-- update_updated_at_column() כבר קיימת (supabase/schema.sql:226)
drop trigger if exists book_fair_books_touch  on public.book_fair_books;
create trigger book_fair_books_touch  before update on public.book_fair_books
  for each row execute function public.update_updated_at_column();

drop trigger if exists book_fair_orders_touch on public.book_fair_orders;
create trigger book_fair_orders_touch before update on public.book_fair_orders
  for each row execute function public.update_updated_at_column();

drop trigger if exists book_fair_calls_touch  on public.book_fair_call_sessions;
create trigger book_fair_calls_touch  before update on public.book_fair_call_sessions
  for each row execute function public.update_updated_at_column();

-- ───────────────────────────────────────────────────────────────────────────
-- 11) RLS — מדיניות לכל טבלה, בלי יוצא מן הכלל
-- ───────────────────────────────────────────────────────────────────────────
--
-- 🔴 RLS מופעל בלי מדיניות = אפס שורות מוחזרות, בלי שגיאה ובלי אזהרה.
-- זה כבר הפיל את המערכת פעמיים (20260901_holiday_centers_rls.sql,
-- 20260914_lineage_approved_ref_rls.sql). לכן *כל* טבלה כאן מקבלת מדיניות
-- באותה מיגרציה שיוצרת אותה.
--
-- ⚠️ למה זה מתגלה רק במסך ולא ב-API: דפי /admin הם Server Components
-- שקוראים בלקוח ANON וכפופים ל-RLS, בעוד נתיבי /api רצים ב-service-role
-- ועוקפים אותו. מדיניות חסרה על book_fair_cities תיראה כ"טרם נבחרה עיר"
-- ליד הזמנה שיש לה עיר — ותעבוד מצוין ב-API.
--
-- ⚠️ בדיקת קבלה: לפתוח כל מסך יריד עם משתמש secretary, לא עם admin.
--
-- הקטלוג הציבורי אינו נקרא בלקוח ANON אלא מוגש מסונן דרך API, ולכן אין
-- מדיניות ציבורית על אף טבלה: stock_phone, stock_web ו-phone_code הם
-- מידע תפעולי שאין סיבה לפרסם, ו-orders מכילה פרטי לקוחות.
do $$
declare t text;
begin
  foreach t in array array[
    'book_fair_books', 'book_fair_cities', 'book_fair_shipping_tiers',
    'book_fair_orders', 'book_fair_order_items', 'book_fair_reservations',
    'book_fair_stock_ledger', 'book_fair_payments', 'book_fair_call_sessions',
    'book_fair_recordings'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff_all', t);
    execute format(
      'create policy %I on public.%I for all using (public.is_staff()) with check (public.is_staff())',
      t || '_staff_all', t
    );
  end loop;
end $$;
