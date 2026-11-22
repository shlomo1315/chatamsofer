-- ─────────────────────────────────────────────────────────────────────────────
-- 🔴 הקשחת אבטחה במסד (ביקורת 07.10).
--
-- הרקע: מפתח ה-anon גלוי בדפדפן, וטוקן הסשן של איש צוות נגיש מה-cookie.
-- כל איש צוות יכול לכן לפנות ישירות ל-/rest/v1 ולעקוף את מטריצת ההרשאות
-- שנאכפת רק ב-API. מה שעוצר אותו הוא RLS בלבד — והמדיניות היתה is_staff()
-- גורפת על כל הטבלאות, כולל:
--
--   1. profiles — מזכירה יכלה לעדכן לעצמה role='admin' (הסלמת הרשאות).
--   2. app_settings — טוקני הרענון של Google (gmail_refresh_token = כל תיבות
--      הדואר; drive_backup_refresh_token = הגיבויים), גיבובי סיסמאות פורטלים
--      וקוד העקיפה של הרישום — קריאים לכל איש צוות.
--   3. gmail_accounts.refresh_token — טוקן לכל תיבה, עוקף allowed_mailboxes.
--   4. recovery_portals / reply_tokens / lineage_share_invites / email_tracking
--      — גיבובי סיסמאות וטוקני גישה.
--
-- ⚠️ לא שובר דבר — נבדק בקוד 07.10:
--   · כל הכתיבות ל-profiles עוברות דרך service role (api/admin/users).
--   · הסודות ב-app_settings נקראים רק דרך service role (lib/gmail,
--     lib/googleDrive, lib/*PortalAuth, lib/registrationGate). דפי היריד
--     שקוראים app_settings עם סשן המשתמש קוראים מפתחות book_fair_* בלבד.
--   · gmail_accounts, recovery_portals, reply_tokens, lineage_share_invites,
--     email_tracking — אפס גישה מסשן משתמש ואפס Realtime.
--   · service role עוקף RLS ואינו מושפע מכל זה.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── 1. profiles: צוות קורא, רק מנהל כותב ─────────────────────────────────────
drop policy if exists profiles_staff_all on public.profiles;
drop policy if exists profiles_staff_select on public.profiles;
drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_staff_select on public.profiles
  for select using (public.is_staff());
create policy profiles_admin_write on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- ── 2. app_settings: סודות לא נקראים ולא נכתבים מחוץ ל-service role ───────
-- ⚠️ לפי שם המפתח: גם סוד שיתווסף בעתיד בשם *_token / *_password וכד'
-- מוגן אוטומטית.
--
-- 🔴 ועוד רשימה מפורשת: מפתחות ששמם תמים אך ה-JSON בתוכם מכיל סודות
-- (נבדק 07.10 לפי שמות השדות):
--   nedarim_card          — apiPassword / holidayApiPassword (טעינת כספים!)
--   payments_provider     — apiValid (+ webhookSecret כשיוגדר)
--   gmail_send_accounts   — refresh_token לכל חשבון שליחה
--   elevenlabs_tts        — apiKey
--   book_fair_seller      — password_hash של הדוכן
--   book_fair_dashboard   — password_hash של לוח היריד
create or replace function public.is_secret_setting(k text)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select coalesce(k, '') ~* '(token|secret|password|passwd|hash|api_?key|private|credential|bypass|perm_backup)'
      or coalesce(k, '') in ('nedarim_card', 'payments_provider', 'gmail_send_accounts',
                             'elevenlabs_tts', 'book_fair_seller', 'book_fair_dashboard')
$$;

drop policy if exists app_settings_staff_all on public.app_settings;
drop policy if exists app_settings_staff_select on public.app_settings;
drop policy if exists app_settings_admin_write on public.app_settings;
create policy app_settings_staff_select on public.app_settings
  for select using (public.is_staff() and not public.is_secret_setting(key));
create policy app_settings_admin_write on public.app_settings
  for all using (public.is_admin() and not public.is_secret_setting(key))
  with check (public.is_admin() and not public.is_secret_setting(key));

-- ── 3. טבלאות טוקנים/סיסמאות — service role בלבד ────────────────────────────
-- RLS פעיל + אין מדיניות = אין גישה מסשן משתמש. ה-API ממשיך לעבוד.
-- ⚠️ 22.11.2026: בבדיקת קיום — recovery_portals אינה נוצרת באף מיגרציה בריפו,
-- ו-DROP POLICY על טבלה שאינה קיימת נכשל גם עם IF EXISTS.
do $$
declare t text;
begin
  foreach t in array array['gmail_accounts', 'recovery_portals', 'reply_tokens', 'lineage_share_invites', 'email_tracking'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', t || '_staff_all', t);
    else
      raise notice 'דילוג — הטבלה לא קיימת: %', t;
    end if;
  end loop;
end $$;

-- ── 4. view שעוקף RLS (security definer) ───────────────────────────────────
alter view public.card_stock_balance set (security_invoker = on);
revoke select on public.card_stock_balance from anon;

-- ── 5. פונקציות טריגר שחשופות ב-/rest/v1/rpc ────────────────────────────────
-- ⚠️ הטריגרים ממשיכים לפעול: הרשאת EXECUTE נבדקת רק ביצירת הטריגר.
-- ⚠️ 22.11.2026: עטוף בבדיקת קיום. הפונקציות לא מוגדרות באף מיגרציה בריפו,
-- ופונקציה שחסרה במסד הייתה מבטלת את כל הטרנזקציה (ובכך את כל ההקשחה).
do $$
declare f text;
begin
  foreach f in array array['public.resync_chains_for_node()', 'public.sync_lineage_chain()'] loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', f);
    else
      raise notice 'דילוג — הפונקציה לא קיימת: %', f;
    end if;
  end loop;
end $$;

-- ── 6. פונקציות סינון — צוות או service role בלבד ──────────────────────────
-- כל משתמש מחובר ב-Supabase Auth (גם מי שנכנס עם Google ונדחה) יכול היה
-- למשוך ספירת משפחות לפי עיר/קהילה.
create or replace function public.beneficiaries_community_options(
  only_special boolean default false, min_count integer default 20, max_rows integer default 24)
returns table(value text, cnt bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select trim(community_affiliation) as value, count(*) as cnt
  from beneficiaries
  where (public.is_staff() or auth.role() = 'service_role')
    and case
      when only_special then is_special is true
      else (is_special is null or is_special is false)
    end
    and nullif(trim(coalesce(community_affiliation, '')), '') is not null
  group by 1
  having count(*) >= greatest(min_count, 1)
  order by cnt desc, value
  limit least(greatest(max_rows, 1), 60);
$$;

-- ── 7. search_path קבוע לפונקציות (מניעת חטיפת שמות) ──────────────────────
-- ⚠️ 22.11.2026: בבדיקת קיום — פונקציה חסרה מדולגת ואינה מפילה את המיגרציה.
do $$
declare f text;
begin
  foreach f in array array[
    'public.il_id_valid(text)', 'public.set_updated_at()', 'public.update_updated_at_column()',
    'public.bump_center_pending_pickups(uuid, integer)', 'public.beneficiary_child_ids(jsonb)',
    'public.lookup_beneficiary_by_child_id(text)', 'public.holiday_center_counts(uuid)',
    'public.lineage_descendant_ids(uuid)', 'public.gratitude_html_to_text(text)'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('alter function %s set search_path = public, pg_temp', f);
    else
      raise notice 'דילוג — הפונקציה לא קיימת: %', f;
    end if;
  end loop;
end $$;

commit;
