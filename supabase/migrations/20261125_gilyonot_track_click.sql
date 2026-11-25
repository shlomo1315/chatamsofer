-- גיליונות: מעקב קליקים אצלנו (/api/gilyonot/c/<טוקן>), באותה פונקציה של הפתיחה וההורדה.
-- קליק או הורדה מסמנים גם פתיחה, למקרה שהפיקסל נחסם.
create or replace function public.gilyonot_track(p_token uuid, p_kind text)
returns uuid
language sql
security definer
set search_path = public
as $$
  update public.gilyonot_deliveries set
    open_count     = open_count + case when p_kind = 'open' then 1 else 0 end,
    opened_at      = coalesce(opened_at, now()),
    download_count = download_count + case when p_kind = 'download' then 1 else 0 end,
    downloaded_at  = case when p_kind = 'download' then coalesce(downloaded_at, now()) else downloaded_at end,
    click_count    = click_count + case when p_kind = 'click' then 1 else 0 end,
    clicked_at     = case when p_kind = 'click' then coalesce(clicked_at, now()) else clicked_at end
  where token = p_token
  returning issue_id;
$$;

revoke all on function public.gilyonot_track(uuid, text) from public, anon, authenticated;
grant execute on function public.gilyonot_track(uuid, text) to service_role;

-- קליק בקישור שלנו: נספר במשלוח, ונרשם גם ב-email_events עם הכתובת עצמה,
-- כדי שטבלת "הקלקות לפי קישור" (gilyonot_link_clicks) תקבל נתונים בלי מעקב הקליקים של Resend.
create or replace function public.gilyonot_track_click(p_token uuid, p_url text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_issue uuid;
  v_resend text;
begin
  v_issue := public.gilyonot_track(p_token, 'click');
  if v_issue is null then return null; end if;
  select resend_id into v_resend from public.gilyonot_deliveries where token = p_token;
  if v_resend is not null then
    insert into public.email_events (resend_id, event_type, link_url, raw)
    values (v_resend, 'clicked', left(p_url, 2000), jsonb_build_object('source', 'gilyonot_link'));
  end if;
  return v_issue;
end;
$$;

revoke all on function public.gilyonot_track_click(uuid, text) from public, anon, authenticated;
grant execute on function public.gilyonot_track_click(uuid, text) to service_role;

-- אם מעקב הקליקים של Resend פעיל, הוא רואה את הקישור העטוף שלנו. הוא לא נספר, כדי שלא תהיה ספירה כפולה.
create or replace function public.gilyonot_link_clicks(p_issue uuid)
returns table (link text, clicks bigint, unique_clickers bigint)
language sql
stable
security definer
set search_path = public
as $$
  select regexp_replace(e.link_url, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', ':token', 'gi') as link,
         count(*) as clicks,
         count(distinct e.resend_id) as unique_clickers
  from public.email_events e
  join public.gilyonot_deliveries d on d.resend_id = e.resend_id
  where d.issue_id = p_issue and e.event_type = 'clicked' and e.link_url is not null
    and e.link_url not like '%/api/gilyonot/c/%'
  group by 1
  order by 2 desc;
$$;

notify pgrst, 'reload schema';
