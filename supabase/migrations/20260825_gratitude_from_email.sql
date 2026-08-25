-- ─────────────────────────────────────────────────────────────────────────────
-- קליטת מכתבי תודה שהגיעו במייל ומעולם לא נקלטו.
--
-- 🔴 58 מכתבי תודה אמיתיים מ-39 שולחים ישבו ב-inbound_emails בלי שאיש
-- ראה אותם. כולם הגיעו בייבוא ההיסטורי מתיבות Gmail (source='legacy'),
-- מסלול שלא עובר דרך ניתוב הברכות שב-webhook של Resend.
--
-- 🔴 ובנוסף: maternity_aid_id היה NOT NULL, כלומר הטבלה הניחה שכל מכתב
-- תודה שייך לתיק לידה. 49 מהשולחות קיבלו *חלוקת חגים* ולא לידה — אין
-- להן תיק לידה למלא בעמודה הזו, ולכן הן לא היו נקלטות גם אילו הניתוב
-- כן היה רץ.
--
-- הורץ ב-25.08.2026 מול פרודקשן: 29 מכתבים נקלטו (70 → 99).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. ברכה אינה בהכרח על לידה ──
alter table gratitude_letters alter column maternity_aid_id drop not null;

-- ⚠️ ברירת מחדל 'maternity' — כל 70 הקיימות הגיעו מטופס הלידה, וכך הן
-- נשארות מסווגות נכון בלי עדכון.
alter table gratitude_letters
  add column if not exists context text not null default 'maternity';

-- ⚠️ המקור נשמר בעיקר כדי למנוע קליטה כפולה של אותו מייל.
alter table gratitude_letters
  add column if not exists inbound_email_id uuid references inbound_emails(id) on delete set null;

create unique index if not exists gratitude_letters_inbound_uniq
  on gratitude_letters(inbound_email_id) where inbound_email_id is not null;

-- ── 2. חילוץ הטקסט מגוף ה-HTML ──
--
-- 🔴 plain_text קטום ל-200 תווים ו-13 מהמכתבים נחתכים בו באמצע משפט.
-- ה-HTML שמור במלואו (עד 53KB) והוא המקור היחיד לטקסט המלא.
--
-- ⚠️ (?is) חייב לפתוח את הביטוי כולו — באמצעו Postgres זורק
-- "quantifier operand invalid".
-- ⚠️ &amp; מפוענח אחרון, אחרת "&amp;quot;" הופך לגרשיים במקום להישאר טקסט.
-- ⚠️ \r מ-CRLF שרד את הניקוי והופיע כתו נראה בגוף הברכה.
create or replace function gratitude_html_to_text(src text)
returns text language sql immutable as $$
  select btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          translate(
            replace(replace(replace(replace(replace(replace(
              regexp_replace(
                regexp_replace(
                  -- חיתוך הציטוט של ההתכתבות הקודמת: בלעדיו גוף הברכה
                  -- מכיל את הבקשה שאנחנו שלחנו.
                  regexp_replace(
                    regexp_replace(coalesce(src,''), '(?is)<blockquote.*$', ''),
                    '(?is)<div[^>]*gmail_quote.*$', ''),
                  -- תגיות בלוק → שורה חדשה, כדי לא להדביק מילים
                  '(?is)<(br|/p|/div|/tr|/li)[^>]*>', E'\n', 'g'),
                '(?is)<[^>]+>', '', 'g'),
              '&quot;', '"'), '&#39;', ''''), '&nbsp;', ' '),
              '&lt;', '<'), '&gt;', '>'), '&amp;', '&'),
            E'\r ', '  '),
          '[ \t]+', ' ', 'g'),
        E'[ ]*\n[ ]*', E'\n', 'g'),
      E'\n{3,}', E'\n\n', 'g')
  );
$$;

-- ── 3. הקליטה ──
--
-- ⚠️ שיוך רק כשלכתובת יש *משפחה אחת*. חמש כתובות משותפות לכמה משפחות
-- (אחת ל-6!) — כתובות של גמ"ח שכונתי או שכן שמתרגם. שיוך שגוי גרוע
-- מאי-קליטה, כי הוא נראה תקין ואיש לא בודק אותו.
--
-- ⚠️ גוף קצר מ-25 תווים מדולג: אלה חתימות ("--") ואישורי קריאה, לא ברכות.
-- ⚠️ מיילים שיצאו מאיתנו מסוננים לפי הדומיין.
with cand as (
  select i.id as email_id, i.created_at, i.from_email,
    gratitude_html_to_text(i.html) as body,
    (select count(distinct b.id) from beneficiaries b where lower(b.email)=lower(i.from_email)) as fc,
    (select b.id from beneficiaries b where lower(b.email)=lower(i.from_email) order by b.id limit 1) as ben_id
  from inbound_emails i
  where i.subject ~ 'מכתב\s*ברכה|מכתב\s*תודה'
    and coalesce(i.is_spam,false) = false
    and lower(i.from_email) not like '%chasamsofer%'
)
insert into gratitude_letters
  (maternity_aid_id, beneficiary_id, source, body, is_anonymous, status, created_at, inbound_email_id, context)
select
  null, c.ben_id, 'email', c.body, false, 'received', c.created_at, c.email_id,
  case when c.body ~ 'חלוק|פסח|לכבוד החג|כרטיס' and c.body !~ 'לידה|יולדת|החלמה|הבראה'
       then 'holidays' else 'maternity' end
from cand c
where c.fc = 1 and length(c.body) >= 25
  -- ⚠️ הרצה חוזרת אינה מכפילה. (אינדקס חלקי אינו תואם ל-ON CONFLICT.)
  and not exists (select 1 from gratitude_letters g where g.inbound_email_id = c.email_id);

comment on column gratitude_letters.maternity_aid_id is
  'תיק הלידה — NULL כשהברכה אינה על לידה (חלוקת חגים וכד'')';
comment on column gratitude_letters.context is
  'ההקשר: maternity / holidays / general';
