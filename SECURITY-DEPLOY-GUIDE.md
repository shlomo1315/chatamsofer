# מדריך פריסה — תיקוני אבטחה (security review)

תיקונים מ-security review מעמיק. סדר פעולות מדויק לפרודקשן חי.

---

## שלב 1 — הרץ את ה-migration ב-Supabase (🔴 הכי דחוף)

**קובץ:** `supabase/migrations/20260720_rls_hardening_followup.sql`

מתקן **דפוס RLS חוזר** — טבלאות שנוצרו אחרי הקשחת ה-RIS מ-11.6 וקיבלו policies פתוחות:
- 🔴 `financial_aid_requests` — בקשות סיוע כספי (PII) — היו קריאות ל-anon
- 🔴 `widow_support_payments` — פנקס תמיכה לאלמנות/יתומים (PII) — היו קריאות ל-anon
- 🟡 `card_centers` — מרכזי חלוקה, כתובות, מלאי
- 🔵 `gov_cities` / `gov_streets` — נתוני כתובות

**הרצה:** Supabase → SQL Editor → הדבק את כל הקובץ → Run.

**בדיקה מיד אחרי (כמשתמש רגיל שלך):**
```sql
select count(*) from financial_aid_requests;  -- אמור: 0 (חסום ל-anon עכשיו)
select count(*) from widow_support_payments;   -- אמור: 0
```
> אם הם חוסמים ל-anon אבל המסכים באתר עדיין מציגים נתונים (דרך service_role) — מצוין, זה בדיוק הרצוי. אם משהו במסכי הצוות נשבר — ודא ש-`is_staff()` קיים (מ-migration 20260611).

---

## שלב 2 — פרוס את הקוד

אחרי ה-migration, מזג את ה-PR ל-main → Railway פורס אוטומטית.

תיקוני הקוד:
- **פורטל הלוואות** (`shared/loans/auth`) — rate-limit + `secure` cookie
- **nodemailer הוסר** — תלות מיותרת עם CVE (high). כל המיילים דרך Resend.
- **widow-request** — ולידציית סכום (דוחה שלילי/NaN/אבסורדי) + rate-limit
- **loan/financial-aid/birth-request** — rate-limit per-מוטב (בולם spam)
- **verify/send** — תקרה גלובלית על שיחות/מיילים (בולם call-bombing)

---

## שלב 3 — בדיקות עשן

- [ ] **פורטל הלוואות** — כניסה עם הסיסמה עובדת (rate-limit לא חוסם שימוש רגיל)
- [ ] **הגשת בקשה בפורטל** (הלוואה/סיוע/לידה) — עובדת פעם אחת רגיל
- [ ] **מסכי צוות** — כל הנתונים עדיין מוצגים (RLS לא חוסם צוות)
- [ ] **שליחת מייל** מהמערכת — עדיין עובדת (Resend, לא nodemailer)

---

## נותר כ-hardening עתידי (לא קריטי)

- **rate-limit ב-shared store** (Redis/Supabase) במקום in-memory — הנוכחי per-instance וניתן לעקיפה חלקית ב-serverless. הוקטן משטח ההתקפה אבל לא נסגר לגמרי.
- **HSTS header** ב-next.config.ts — מונע downgrade ל-HTTP.
- שקילת CAPTCHA על verify/send אם יימשכו ניסיונות flooding.
