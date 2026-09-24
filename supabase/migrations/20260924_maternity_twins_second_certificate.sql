-- בלידת תאומים יש שני אישורי לידה נפרדים (אחד לכל תינוק) ולא מסמך משותף.
-- עמודה שנייה מקבילה ל-birth_certificate_url, המשמשת רק כשיש שני תינוקות.
alter table maternity_aids
  add column if not exists birth_certificate_url_2 text;
