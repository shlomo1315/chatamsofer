-- 🔴 תיקון אבטחה (ביקורת 05.10) — ⏳ טרם הורץ, ממתין לאישור המשתמש.
--
-- מבקר אנונימי (מפתח ה-anon גלוי בדפדפן) יכול היה להריץ דרך
-- /rest/v1/rpc פונקציות SECURITY DEFINER ולקבל:
--   · beneficiaries_filter_options — כמה משפחות בכל עיר / מצב משפחתי /
--     סטטוס זכאות / מקור רישום (אומת: anon קיבל את כל הספירות).
--   · beneficiaries_community_options — כמה משפחות בכל קהילה.
--   · next_book_fair_order_number — "שריפת" מספרי הזמנה מבחוץ.
--
-- ⚠️ לא שובר דבר: שתי הראשונות נקראות מהשרת עם סשן הצוות (authenticated),
-- והשלישית עם service role (checkout / payment-callback / seller / yemot).

revoke execute on function public.beneficiaries_filter_options(boolean) from public, anon;
grant  execute on function public.beneficiaries_filter_options(boolean) to authenticated, service_role;

revoke execute on function public.beneficiaries_community_options(boolean, integer, integer) from public, anon;
grant  execute on function public.beneficiaries_community_options(boolean, integer, integer) to authenticated, service_role;

revoke execute on function public.next_book_fair_order_number() from public, anon, authenticated;
grant  execute on function public.next_book_fair_order_number() to service_role;
