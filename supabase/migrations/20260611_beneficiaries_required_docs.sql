-- רשימת המסמכים שהמזכירות סימנה כחסרים (מפתחות מופרדים בפסיק, למשל: id_husband,id_wife)
-- הנתמך מקבל קישור במייל ומעלה בדיוק את המסמכים האלה דרך הפורטל.
alter table beneficiaries
  add column if not exists required_docs text default '';
