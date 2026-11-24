-- ─────────────────────────────────────────────────────────────────────────────
-- מעקב פתיחות וקליקים של הניוזלטר אצלנו (פיקסל וקישורים עטופים), עם פילוח
-- מכשיר, לקוח מייל ומערכת הפעלה, וסימון פתיחות וקליקים של מכונות.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.email_events alter column resend_id drop not null;
alter table public.email_events add column if not exists device     text;
alter table public.email_events add column if not exists client     text;
alter table public.email_events add column if not exists os         text;
alter table public.email_events add column if not exists is_machine boolean not null default false;
alter table public.email_events add column if not exists machine_reason text;
alter table public.email_events add column if not exists source     text not null default 'resend'; -- resend | own

alter table public.campaign_recipients add column if not exists own_tracking boolean not null default false;

create index if not exists email_events_recipient_type on public.email_events (recipient_id, event_type);

-- רישום אטומי של פתיחה או קליק: אירוע בטבלה, ועדכון הנמען.
-- שעת הפתיחה והקליק הראשונים נשמרות (coalesce), והמונים עולים רק על אירוע של אדם.
-- קליק של אדם מסמן גם פתיחה, כי מי שהקליק פתח (גם כשהתמונות חסומות).
create or replace function public.newsletter_track(
  p_recipient uuid, p_kind text, p_link text, p_ua text,
  p_device text, p_client text, p_os text,
  p_machine boolean, p_reason text, p_source text, p_raw jsonb default null
) returns void
language plpgsql security definer set search_path = public as $$
declare r public.campaign_recipients%rowtype;
begin
  select * into r from public.campaign_recipients where id = p_recipient;
  if not found then return; end if;

  insert into public.email_events (resend_id, recipient_id, event_type, link_url, user_agent, device, client, os, is_machine, machine_reason, source, raw)
  values (r.resend_id, p_recipient, case when p_kind = 'click' then 'clicked' else 'opened' end,
          p_link, nullif(p_ua, ''), p_device, p_client, p_os, coalesce(p_machine, false), p_reason, coalesce(p_source, 'own'), p_raw);

  if coalesce(p_machine, false) then return; end if;

  if p_kind = 'click' then
    update public.campaign_recipients
       set clicked_at = coalesce(clicked_at, now()),
           click_count = coalesce(click_count, 0) + 1,
           opened_at = coalesce(opened_at, now()),
           open_count = greatest(coalesce(open_count, 0), 1)
     where id = p_recipient;
  else
    update public.campaign_recipients
       set opened_at = coalesce(opened_at, now()),
           open_count = coalesce(open_count, 0) + 1
     where id = p_recipient;
  end if;
end $$;

revoke all on function public.newsletter_track(uuid, text, text, text, text, text, text, boolean, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.newsletter_track(uuid, text, text, text, text, text, text, boolean, text, text, jsonb) to service_role;
