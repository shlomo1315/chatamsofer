-- אימות טלפונים גמיש: רשימת המספרים שאומתו לכל נרשם (מנורמלים לספרות, 05...).
-- רק מספר שמופיע כאן יוכל לקבל קוד כניסה (OTP) בעתיד.
alter table public.beneficiaries
  add column if not exists verified_phones text[];

-- מילוי-לאחור: טלפון הבעל של הנרשמים הקיימים אומת ברישום (היה חובה), לכן נחשב מאומת.
update public.beneficiaries
   set verified_phones = array[
     case
       when regexp_replace(phone, '\D', '', 'g') like '00972%' then '0' || substr(regexp_replace(phone, '\D', '', 'g'), 6)
       when regexp_replace(phone, '\D', '', 'g') like '972%'   then '0' || substr(regexp_replace(phone, '\D', '', 'g'), 4)
       else regexp_replace(phone, '\D', '', 'g')
     end
   ]
 where phone is not null and phone <> '' and verified_phones is null;
