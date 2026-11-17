-- ניקוי כותרת הודעה מועברת (noreply@yeda-phone.co.il, "ידע - פון תא קולי", כתובות מייל) מ-raw_text
-- בבקשות קוויטל שהגיעו במייל. אותה לוגיקה כמו stripYedaPhoneNoise ב-lib/kvitelEmail.ts.
-- חוזר בבטחה: אחרי הריצה אין עוד 'yeda-phone' או 'ידע פון'. משפיע רק על channel = 'email'.
update public.kvitel_requests
set raw_text = btrim(
  regexp_replace(
    regexp_replace(
      regexp_replace(raw_text, E'(^|\\n)[^\\n]*ידע\\s*[-–]?\\s*פון[^\\n]*', '', 'g'),
      E'(^|\\n)[^\\n]*(-{3,}\\s*Forwarded|[\\w.+-]+@[\\w-]+\\.[\\w.-]+)[^\\n]*', '', 'gi'),
    E'\\n{3,}', E'\n\n', 'g'),
  E' \n\t\r')
where channel = 'email'
  and raw_text ~* '(yeda-phone|ידע\s*[-–]?\s*פון)';
