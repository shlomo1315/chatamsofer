-- ניקוי קישורים וחתימה של ידע פון מ-raw_text בבקשות קוויטל שהגיעו במייל.
-- אותה לוגיקה כמו stripYedaPhoneNoise ב-lib/kvitelEmail.ts. חוזר בבטחה: אחרי הריצה אין עוד 'yeda-phone'.
-- מסנן מפורש: channel = 'email' ו-raw_text שמכיל yeda-phone בלבד.
update public.kvitel_requests
set raw_text = btrim(
  regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(raw_text, E'(^|\\n)[^\\n]*ידע\\s*פון.*$', '', ''),
        E'(^|\\n)[^\\n]*(הגדרות השאלון|לצפי[הת]? בתוצאות השאלון)[^\\n]*', '', 'g'),
      E'[<\\[(]*https?://[^\\s<>\\])]*yeda-phone[^\\s<>\\])]*[>\\])]*', '', 'gi'),
    E'\\n{3,}', E'\n\n', 'g'),
  E' \n\t\r')
where channel = 'email'
  and raw_text ilike '%yeda-phone%';
