-- רענון מיידי (Realtime) לרשימת המייל: הוספת טבלאות המייל לפרסום ה-Realtime של Supabase.
-- כך כל מייל נכנס/יוצא חדש נדחף מיד למסך הצוות, בלי להמתין לפולינג.
-- בטוח להרצה חוזרת — מתעלם אם הטבלה כבר בפרסום.
do $$
begin
  begin
    alter publication supabase_realtime add table inbound_emails;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table sent_emails;
  exception when duplicate_object then null;
  end;
end $$;
