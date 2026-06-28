-- בחירת מוקד לקבלת כרטיס היולדת + ניהול מלאי/שובר
-- card_center_id כבר קיים ב-maternity_aids (מהגירה 20260614).

-- מונה "ממתינים לאיסוף" בכל מוקד — אינדיקציה כמה כרטיסים צפויים להיאסף (לא מחייב).
alter table card_centers
  add column if not exists pending_pickups integer not null default 0;

-- מספר סידורי לשובר (מראה אמין) + תיעוד מועד איסוף הכרטיס בפועל +
-- סטטוס שובר הכרטיס: issued (הונפק שובר) / awaiting_stock (ממתין למלאי במוקד שנבחר).
alter table maternity_aids
  add column if not exists voucher_serial text,
  add column if not exists card_picked_up_at timestamptz,
  add column if not exists card_voucher_status text;

-- עדכון אטומי של מונה הממתינים (delta חיובי/שלילי), לא יורד מתחת ל-0.
create or replace function bump_center_pending_pickups(p_center_id uuid, p_delta integer)
returns integer language sql as $$
  update card_centers
    set pending_pickups = greatest(0, pending_pickups + p_delta), updated_at = now()
    where id = p_center_id
  returning pending_pickups;
$$;
