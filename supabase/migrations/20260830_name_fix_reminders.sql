-- ─────────────────────────────────────────────────────────────────────────────
-- תזכורת שבועית להשלמת שם התינוק.
--
-- קישור תיקון השם נשלח עד כה בלחיצה ידנית בלבד. תיק שהיולדת סימנה בו
-- "עדיין אין שם" נשאר ממתין ללא הגבלה — הישן שבהם כבר חודשיים.
--
-- שתי עמודות מעקב, כדי שהתזכורת תדע מתי נשלחה לאחרונה וכמה פעמים:
--   • name_reminder_sent_at — מועד התזכורת האחרונה (NULL = טרם נשלחה)
--   • name_reminder_count   — כמה תזכורות יצאו לתיק הזה
--
-- ⚠️ המונה עוצר ב-4 (חודש של תזכורות שבועיות). בלעדיו משפחה שלא משלימה
-- את השם הייתה מקבלת מייל כל שבוע לנצח — הדרך הבטוחה לסימון כספאם, שגורר
-- את *כל* מיילי המערכת לתיקיית הזבל. המזכירות עדיין יכולה לשלוח ידנית.
-- ─────────────────────────────────────────────────────────────────────────────

alter table maternity_aids
  add column if not exists name_reminder_sent_at timestamptz,
  add column if not exists name_reminder_count integer not null default 0;

-- התזכורת סורקת לפי הדגל ולפי מועד השליחה האחרון. אינדקס חלקי — רק על
-- התיקים הממתינים, שהם מיעוט קטן מהטבלה.
create index if not exists maternity_aids_name_reminder_idx
  on maternity_aids (name_reminder_sent_at)
  where baby_name_pending = true;

comment on column maternity_aids.name_reminder_sent_at is
  'מועד תזכורת השלמת שם התינוק האחרונה. NULL = טרם נשלחה תזכורת אוטומטית.';
comment on column maternity_aids.name_reminder_count is
  'מספר התזכורות האוטומטיות שנשלחו. עוצר ב-4 כדי שלא להטריד ולא להיתפס כספאם.';
