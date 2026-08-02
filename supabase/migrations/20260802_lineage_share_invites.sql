-- ─────────────────────────────────────────────────────────────────────────────
-- שיתוף מוגבל של ענף בעץ הדורות עם בן משפחה.
--
-- אדמין לוחץ על צומת בעץ ומייצר הזמנה: לינק לתת-העץ מהצומת ומטה בלבד. בן המשפחה
-- נכנס דרך הלינק, מאשר / דוחה / מתקן צמתים — וזה נקלט אוטומטית בכל האגפים (הצ'יפים
-- בכרטסות נגזרים מסטטוס הצומת בעץ).
--
-- טוקן אקראי בר-ביטול (ולא HMAC אטומי) — כי צריך יכולת ביטול גישה ורישום שם/מייל
-- של המקבל, שדורשים שורה במסד. root_node_id מגדיר את גבול השיתוף (תת-העץ בלבד).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.lineage_share_invites (
  token           text primary key,                               -- אקראי, ~16 תווים
  root_node_id    uuid not null references public.lineage_nodes(id) on delete cascade,
  recipient_name  text,                                           -- שם מקבל ההרשאה (לתצוגה בחלונית)
  recipient_email text,                                           -- המייל שאליו נשלח הלינק
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '30 days'),
  revoked_at      timestamptz,                                    -- ביטול הרשאה ע"י אדמין
  last_used_at    timestamptz                                     -- כניסה אחרונה של המקבל
);

create index if not exists lineage_share_invites_root
  on public.lineage_share_invites (root_node_id);

alter table public.lineage_share_invites enable row level security;
-- service-role בלבד (אין policies) — הגישה כולה דרך ה-API המאומת
