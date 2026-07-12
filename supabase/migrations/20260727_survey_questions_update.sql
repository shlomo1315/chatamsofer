-- עדכון שאלות המשוב לפי בקשת הלקוח.

-- שאלה 4: לשון רבים
update public.survey_questions
   set text = 'האם תמליצו לחברה על בית ההחלמה הזה?'
 where survey = 'recovery' and position = 4;

-- שאלה 5: רק "הערות והארות"
update public.survey_questions
   set text = 'הערות והארות'
 where survey = 'recovery' and position = 5;
