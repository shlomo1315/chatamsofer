-- הגבלת סוגי הקבצים בדלי הציבורי של הארכיון: PDF, תמונות ו-Word בלבד.
update storage.buckets
set allowed_mime_types = array[
  'application/pdf','image/jpeg','image/png','image/webp','image/gif',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]
where id = 'gilyonot-public';
