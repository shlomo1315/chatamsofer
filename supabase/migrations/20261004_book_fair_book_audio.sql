-- הקלטה קולית לכל ספר בשלוחה הטלפונית.
--
-- 🔴 למה: שם הספר מוקרא היום ב-TTS של ימות מתוך {title}, ושמות ספרי
-- קודש ("שו״ת חתם סופר", "ליקוטי הערות") יוצאים משובשים. הקלטה
-- אנושית או נוירונית לכל ספר נשמעת נכון.
--
-- ⚠️ שם הקובץ בלבד (בלי סיומת), כמו ב-yemot_book_fair_messages:
-- הקובץ עצמו יושב ב-ivr2:/9 בימות, והנתיב נבנה בקוד.
-- ⚠️ null = אין הקלטה ⇒ נפילה ל-TTS. זהו המצב התקין לרוב הקטלוג,
-- לא שגיאה.

alter table book_fair_books
  add column if not exists audio_name text;

comment on column book_fair_books.audio_name is
  'שם קובץ ההקלטה בשלוחה (בלי סיומת). null = הקראה ב-TTS';

-- הקלטה לכל קטגוריה.
--
-- ⚠️ הקטגוריה אינה טבלה אלא ערך בשדה description של הספר, ולכן
-- ההקלטות שלה יושבות ב-app_settings ולא בעמודה. ראו
-- lib/bookFairCategoryAudio.
insert into app_settings (key, value, updated_at)
values ('book_fair_category_audio', '{}', now())
on conflict (key) do nothing;
