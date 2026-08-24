-- ═══════════════════════════════════════════════════════════════════════════
-- הידוק אבטחה — סריקה מקיפה 25.08.2026
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. מדיניות קריאה פתוחות מדי ──
-- שתי טבלאות אפשרו קריאה לכל משתמש מחובר (using true) במקום לצוות בלבד.
-- במערכת 9 משתמשים וכולם צוות, ולכן החשיפה בפועל הייתה אפסית — אבל הכלל
-- חייב להיות זהה בכל הטבלאות, אחרת משתמש עתידי שאינו צוות יקבל גישה
-- בלי שאיש ישים לב.
drop policy if exists "name_change_staff_read" on public.name_change_requests;
create policy "name_change_staff_read" on public.name_change_requests
  for select using (public.is_staff());

drop policy if exists "approval_labels_read" on public.approval_labels;
create policy "approval_labels_read" on public.approval_labels
  for select using (public.is_staff());

-- ── 2. 🔴 פונקציות SECURITY DEFINER שניתן היה להריץ מהאינטרנט ──
--
-- consume_card_stock ו-decrement_card_center_stock משנות מלאי כרטיסים
-- ממשי: כל אחד עם המפתח הציבורי (שנמצא בקוד הדפדפן) יכול היה לרוקן את
-- המלאי בקריאות חוזרות. rls_auto_enable משנה הגדרות אבטחה.
-- verify_portal_password חשפה משטח לניחוש סיסמאות בלי הגבלת קצב.
--
-- ⚠️ revoke מ-anon/authenticated לבדו אינו מספיק: ההרשאה מגיעה מ-PUBLIC
-- שכולל את כל התפקידים. השלילה מ-PUBLIC היא זו שתופסת.
--
-- ⚠️ אומת לפני השלילה שכולן נקראות מהשרת בלבד דרך service client.
revoke execute on function public.consume_card_stock(text, uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.decrement_card_center_stock(uuid) from public, anon, authenticated;
revoke execute on function public.hash_portal_password(text) from public, anon, authenticated;
revoke execute on function public.verify_portal_password(text, text) from public, anon, authenticated;
revoke execute on function public.increment_invite_use(text) from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

grant execute on function public.consume_card_stock(text, uuid, text, uuid) to service_role;
grant execute on function public.decrement_card_center_stock(uuid) to service_role;
grant execute on function public.hash_portal_password(text) to service_role;
grant execute on function public.verify_portal_password(text, text) to service_role;
grant execute on function public.increment_invite_use(text) to service_role;
grant execute on function public.rls_auto_enable() to service_role;

-- ⚠️ is_staff ו-is_admin נשארות פתוחות במכוון: מדיניות ה-RLS עצמן
-- קוראות להן בהקשר המשתמש, ושלילה תשבור את כל הגישה לטבלאות.
