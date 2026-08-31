-- 🔴 החסם האמיתי במחיקת משתמש.
--
-- ארבעה מפתחות זרים ל-profiles נותרו NO ACTION, בעוד 20 האחרים הוגדרו
-- SET NULL. די בקמפיין אחד שיצר עובד כדי לחסום את מחיקתו לחלוטין —
-- והשגיאה שחוזרת מ-GoTrue היא "Database error deleting user", שאינה
-- רומזת כלל על הסיבה ושולחת לחפש במקום הלא נכון.
--
-- ⚠️ SET NULL ולא CASCADE: השדות האלה הם *תיעוד* ("מי יצר", "מי אישר").
-- מחיקת עובד שעזב אינה סיבה למחוק את הקמפיין, את הפילוח או את מכתב
-- הברכה שהוא נגע בהם — הרשומות שייכות לארגון, לא לעובד.

alter table public.campaigns
  drop constraint if exists campaigns_created_by_fkey,
  add constraint campaigns_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.segments
  drop constraint if exists segments_created_by_fkey,
  add constraint segments_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.gratitude_letters
  drop constraint if exists gratitude_letters_reviewed_by_fkey,
  add constraint gratitude_letters_reviewed_by_fkey
    foreign key (reviewed_by) references public.profiles(id) on delete set null;

alter table public.dismissed_pending_tasks
  drop constraint if exists dismissed_pending_tasks_dismissed_by_fkey,
  add constraint dismissed_pending_tasks_dismissed_by_fkey
    foreign key (dismissed_by) references public.profiles(id) on delete set null;
