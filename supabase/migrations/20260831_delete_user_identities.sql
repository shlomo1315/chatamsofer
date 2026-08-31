-- מחיקת משתמש: ניקוי זהויות וסשנים לפני מחיקת המשתמש עצמו.
--
-- 🔴 הבאג: GoTrue נופל ב-"Database error deleting user" כשלמשתמש יש יותר
-- מזהות אחת — נרשם עם מייל ואז התחבר עם Google, אותה כתובת בדיוק ושתי
-- שורות ב-auth.identities. המנהל ראה "שגיאה במחיקה" בלי שום כיוון.
--
-- 🔴 וגם: מחיקת המשתמש לא ניתקה אותו. auth.sessions נמחק ב-CASCADE, אבל
-- רק *אחרי* שהמחיקה מצליחה — ובינתיים אסימון הגישה שבידו נשאר תקף עד
-- שיפוג. מי שנמחק המשיך לעבוד במערכת.
--
-- ⚠️ SECURITY DEFINER: סכמת auth אינה נגישה ל-service_role בקריאה רגילה.
-- הפונקציה מוגדרת על בעליה, ולכן search_path נעול מפורשות — בלעדיו
-- אפשר להטעות אותה לטבלה אחרת בשם זהה.
create or replace function public.delete_user_identities(target_user uuid)
returns void
language plpgsql
security definer
set search_path = auth, pg_catalog
as $$
begin
  -- 🔴 הסשנים תחילה — זה מה שמנתק מיד. refresh_tokens נמחקים ב-CASCADE
  -- מהסשן, כך שגם חידוש אסימון נחסם.
  delete from auth.sessions where user_id = target_user;

  -- ⚠️ הזהויות: זה מה שפותר את "Database error deleting user".
  delete from auth.identities where user_id = target_user;
end;
$$;

-- ⚠️ service_role בלבד. המסלול היחיד שקורא לכאן הוא DELETE /api/admin/users,
-- שכבר אוכף requireAdmin — פונקציה שמנתקת משתמשים אינה צריכה להיות
-- זמינה לתפקידים אחרים.
revoke all on function public.delete_user_identities(uuid) from public, anon, authenticated;
grant execute on function public.delete_user_identities(uuid) to service_role;

comment on function public.delete_user_identities(uuid) is
  'מנקה סשנים וזהויות לפני מחיקת משתמש. פותר "Database error deleting user" בריבוי זהויות, ומנתק מיד.';
