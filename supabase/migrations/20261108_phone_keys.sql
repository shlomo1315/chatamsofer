-- מעבר מלא לטכנוליין: נוסחי השלוחות ויומן הפעולות עוברים לשמות כלליים (phone_*).
-- לא הרסני: המפתחות הישנים נשארים במסד, ושום עמודה או טבלה לא נמחקות.

insert into public.app_settings (key, value)
select replace(key, 'yemot_', 'phone_'), value
from public.app_settings
where key in ('yemot_main_menu_messages', 'yemot_holiday_messages', 'yemot_maternity_messages', 'yemot_book_fair_messages')
on conflict (key) do nothing;

update public.activity_log
set action = 'phone_' || substr(action, 7)
where action like 'yemot\_%';
