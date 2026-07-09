# לשונית ארכיון מייל קודם + הכנסה ל-Gmail — תכנון

**תאריך:** 2026-07-09
**סטטוס:** מאושר, ממתין לתוכנית מימוש
**המשך ל:** סנכרון מייל קודם (כבר בפרודקשן — הכפתור מושך ושומר ל-inbound_emails עם source='legacy')

## הרקע

הפיצ'ר הקיים מושך מיילים היסטוריים מתיבת Gmail ישנה ושומר אותם ב-inbound_emails
עם source='legacy' ושיוך beneficiary_id. **חסר:** מסך לצפייה בהם. כרגע הם מסוננים
החוצה מתיבת המייל התפעולית ולא נראים בשום מקום. בנוסף התבקש שהמיילים ייכנסו גם
לתיבת ה-Gmail של office עם תווית.

## ארבע הדרישות (כולן בפריסה אחת — החלטת המשתמש "הכל יחד")

### 1. לשונית "ארכיון מייל קודם" בממשק המייל
- תיקייה חדשה ב-FOLDER_ITEMS של MailClient (`app/admin/mail/MailClient.tsx`).
- מציגה מיילים עם source='legacy'.
- **הפרדה פנימית: "משויכים" מול "לא משויכים"** (לפי beneficiary_id null/not-null).
- route ה-messages (`app/api/admin/mail/messages/route.ts`) יחזיר legacy כשהתיקייה היא
  הארכיון (כרגע מסנן `source='resend'` — צריך תנאי לפי folder).

### 2. שיוך ידני — כפתור "שייך ללקוח" על כל מייל לא-משויך
- כפתור על מיילים לא-משויכים → חיפוש לקוח (שימוש חוזר ב-`app/api/admin/beneficiary-search`)
  → בחירה → עדכון beneficiary_id.
- endpoint חדש: `POST /api/admin/mail/assign-beneficiary` — { messageId, beneficiaryId }.

### 3. תוויות בתוכנה
- מנגנון התוויות כבר קיים (labelDefs, onToggleLabel, onCreateLabel ב-MailClient +
  `app/api/admin/mail/labels`). מיילי legacy יקבלו תוויות כמו כל מייל — עובד אוטומטית
  ברגע שהם מוצגים בתיקייה. אין עבודה נוספת מהותית.

### 4. הכנסה לתיבת Gmail של office עם תווית "ארכיון מייל קודם"
- בזמן syncLegacyMail — כל מייל **גם** מוכנס לתיבת office דרך `gmail.users.messages.insert`
  (חשבון office יש לו scope gmail.modify — מאושר).
- התווית נוצרת פעם אחת דרך `ensureLabel(gmail, 'ארכיון מייל קודם')`.
- **טיפול בשגיאות קריטי:** כשל בהכנסה ל-Gmail לא ישבור את השמירה ל-DB (try/catch נפרד,
  לוג בלבד). ה-DB הוא מקור האמת; ה-Gmail הוא עותק לנוחות.
- **מודעות לביצועים:** מכפיל קריאות API (כתיבה לכל מייל). מקובל לפי החלטת המשתמש.

## סוגיות פתוחות לשלב המימוש
- מבנה ההפרדה "משויכים/לא-משויכים": שני tabs פנימיים, או מסנן, או שתי רשימות זו אחר זו.
- האם ה-insert ל-Gmail צריך דגל למניעת כפילות אם המשיכה רצה שוב (המייל כבר ב-Gmail).
- עדכון מונה ה-unmatched בסטטוס אחרי שיוך ידני.

## מה כבר קיים ולא צריך לבנות
- מנגנון תיקיות (FOLDER_ITEMS), תוויות (labels), חיפוש לקוחות (beneficiary-search),
  ensureLabel, scope gmail.modify של office. הכל קיים — רק להרכיב.
