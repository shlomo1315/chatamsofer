-- קוד הכניסה הזמני בטקסט גלוי — נדרש כדי ששלוחת ה-API (yemot-otp) תוכל להקריא
-- אותו בשיחה. נשמר לזמן קצר בלבד (תוקף 5 דק' כמו ה-hash), חד-פעמי, ומנוקה מיד
-- אחרי שהוקרא בשיחה וגם בכניסה מוצלחת. ה-hash (portal_phone_code_hash) נשאר
-- לאימות הקוד שהמשתמש מקליד בפורטל.
alter table beneficiaries
  add column if not exists portal_phone_code_plain text;
