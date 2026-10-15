-- ─────────────────────────────────────────────────────────────────────────────
-- גיליונות — מערך המפיצים: מספר מסלול לשליח, ואיחוד כתיב הערים.
-- route = מספר העצירה של השליח בתוך העיר (מקובץ המסלולים). המסלול של עיר =
-- המפיצים שלה ממוינים לפי המספר. ריק = עוד לא שובץ.
-- הייבוא: "ייבוא חוברת + מסלולים" במסך (lib/gilyonotDistributorBooklet.ts).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.gilyonot_distributors
  add column if not exists route integer check (route is null or (route > 0 and route <= 9999));

create index if not exists gilyonot_distributors_route_idx on public.gilyonot_distributors (status, city, route);

-- כתיבים שונים של אותה עיר → שם אחד (כמו cleanCity ב-lib/gilyonotDistributors.ts)
update public.gilyonot_distributors d set city = m.city, updated_at = now()
from (values
  ('ירושלים', 'ירושלים'), ('ירושלם', 'ירושלים'), ('ירושליים', 'ירושלים'),
  ('בניברק', 'בני ברק'), ('בנינרק', 'בני ברק'), ('בניבג', 'בני ברק'), ('בניברך', 'בני ברק'),
  ('ביתר', 'ביתר עילית'), ('ביתרעילית', 'ביתר עילית'), ('ביתרעלית', 'ביתר עילית'),
  ('מודיעיןעילית', 'מודיעין עילית'), ('מודיעיןעלית', 'מודיעין עילית'), ('קריתספר', 'מודיעין עילית'), ('קרייתספר', 'מודיעין עילית'),
  ('ביתשמש', 'בית שמש'), ('אלעד', 'אלעד'), ('אשדוד', 'אשדוד'),
  ('קריתגת', 'קרית גת'), ('קרייתגת', 'קרית גת'), ('גבעתזאב', 'גבעת זאב')
) as m(k, city)
where regexp_replace(d.city, '["''`׳״[:space:]–-]', '', 'g') = m.k and d.city is distinct from m.city;
