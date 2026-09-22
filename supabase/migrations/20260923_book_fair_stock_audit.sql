-- ───────────────────────────────────────────────────────────────────────────
-- ביקורת מלאי ליריד הספרים — השוואה בין מקור האמת ליומן התנועות
-- ───────────────────────────────────────────────────────────────────────────
--
-- 🔴 הפונקציה הזו נקראה מה-cron מהיום הראשון (book-fair-cleanup, סעיף 3)
-- אבל מעולם לא נוצרה. הקריאה שם עטופה ב-catch שמחזיר null בשקט, ולכן
-- "בדיקת ההתאמה בין המלאי ליומן" שמובטחת בהערות פשוט לא רצה מעולם.
--
-- למה זה חשוב: באג בשחרור שריון אינו מייצר שגיאה — רק מלאי שיורד לאיטו.
-- הקטלוג מתחיל להציג "אזל" על ספרים שיש מהם במחסן, ואין שום סימן לכך
-- עד שמישהו סופר ידנית. הבדיקה הזו הופכת כשל שקט לשורת לוג.
--
-- ⚠️ קריאה בלבד. אינה מתקנת דבר — תיקון אוטומטי של פער שלא הובן הוא
-- בדיוק הדרך לאבד מלאי אמיתי. המספרים מוצגים, ואדם מכריע.
--
-- ── המודל ──
-- מקור האמת: stock_web + stock_phone על הספר, שפירושם "זמין למכירה".
-- המלאי הפיזי = זמין + סך השריונים הפעילים (held שטרם פג).
--
-- היומן: SUM(delta) על כל התנועות של הספר בערוץ. reserve כותב delta שלילי
-- ו-release חיובי, ולכן הסכום אמור להשתוות למלאי ה*זמין* — לא לפיזי.
-- (consume כותב delta 0 בכוונה: המלאי כבר נוכה בשריון.)
--
-- ⇒ בספר תקין: SUM(ledger.delta) = stock_<channel>. כל פער הוא באג.

create or replace function public.book_fair_stock_audit()
returns table (
  book_id       uuid,
  title         text,
  sku           text,
  channel       text,
  stock_actual  integer,   -- מקור האמת: העמודה על הספר
  stock_ledger  integer,   -- סכום תנועות היומן
  drift         integer,   -- actual - ledger. שלילי = המלאי נשחק
  held_qty      integer    -- שריונים פעילים, להקשר בלבד
)
language sql
security definer
set search_path = public
as $$
  with channels as (
    -- שתי שורות לכל ספר: אחת לכל ערוץ. cross join על רשימה קבועה
    -- ולא union, כדי ששינוי עתידי בערוצים ייגע במקום אחד.
    select b.id, b.title, b.sku, c.ch,
           case c.ch when 'web' then b.stock_web else b.stock_phone end as actual
      from public.book_fair_books b
      cross join (values ('web'), ('phone')) as c(ch)
  ),
  ledger as (
    select l.book_id, l.channel, sum(l.delta)::integer as total
      from public.book_fair_stock_ledger l
     group by l.book_id, l.channel
  ),
  held as (
    -- ⚠️ רק שריונים שעדיין תקפים. שריון שפג זמנו אך טרם נוקה אינו
    -- מחזיק מלאי בפועל — הפקיעה העצלה תשחרר אותו בפנייה הבאה.
    select r.book_id, r.channel, sum(r.quantity)::integer as qty
      from public.book_fair_reservations r
     where r.status = 'held' and r.expires_at > now()
     group by r.book_id, r.channel
  )
  select c.id, c.title, c.sku, c.ch,
         c.actual,
         coalesce(l.total, 0),
         c.actual - coalesce(l.total, 0),
         coalesce(h.qty, 0)
    from channels c
    left join ledger l on l.book_id = c.id and l.channel = c.ch
    left join held   h on h.book_id = c.id and h.channel = c.ch
   -- רק הפערים. ספר תקין אינו מעניין ואינו צריך לעבור ברשת.
   where c.actual <> coalesce(l.total, 0)
   order by abs(c.actual - coalesce(l.total, 0)) desc, c.title;
$$;

comment on function public.book_fair_stock_audit() is
  'ביקורת מלאי יריד הספרים: מחזירה רק ספרים שבהם המלאי בעמודה אינו תואם לסכום היומן. קריאה בלבד.';

-- ⚠️ service_role בלבד, כמו שאר פונקציות המחלקה. אין סיבה שלקוח
-- ציבורי או מזכירה יריצו סריקה כלל-קטלוגית.
revoke all on function public.book_fair_stock_audit() from public, anon, authenticated;
grant execute on function public.book_fair_stock_audit() to service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- בקט התמונות
-- ───────────────────────────────────────────────────────────────────────────
--
-- ⚠️ הקוד מעלה ל-'book-fair-images' (books/[id]/image/route.ts) ובונה ממנו
-- URL ציבורי, אך הבקט לא נוצר באף מיגרציה. העלאת התמונה הראשונה הייתה
-- נכשלת עד שמישהו יוצר אותו ידנית בקונסול — תקלה שמתגלה רק בשימוש.
--
-- ציבורי לקריאה: אלו כריכות ספרים בחנות פתוחה. הכתיבה מוגנת בראוט עצמו
-- (requirePermission) ועוברת דרך service_role בלבד.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'book-fair-images', 'book-fair-images', true,
  3 * 1024 * 1024,                                   -- 3MB לכריכה, בשפע
  array['image/jpeg','image/png','image/webp','image/avif']
)
on conflict (id) do nothing;
