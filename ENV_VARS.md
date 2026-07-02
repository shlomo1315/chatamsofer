# משתני סביבה — היכל החתם סופר (Railway → Variables)

מסמך מלא של **כל** משתני הסביבה. יש להגדיר את כל המסומנים "חובה" לפני עלייה לאוויר.
ליצירת ערך סודי אקראי חזק, הריצו במחשב:  `openssl rand -hex 32`

---

## 🔒 1. קריטי לאבטחה — חובה (ערך אקראי חזק לכל אחד)

| משתנה | תיאור | הערות |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | מפתח-על של Supabase (גישה מלאה) | מ-Supabase → Project Settings → API. **סודי ביותר.** |
| `OTP_NONCE_SECRET` | חתימת קודי אימות (OTP) וסשן הפורטל הציבורי | `openssl rand -hex 32` |
| `LOANS_PORTAL_SECRET` | סשן פורטל ההלוואות המשותף | `openssl rand -hex 32` |
| `CRON_SECRET` | הגנת המשימות המתוזמנות (גיבוי, סנכרון) | `openssl rand -hex 32` — **נכשל-סגור**: בלעדיו ה-cron חסום |
| `YEMOT_WEBHOOK_SECRET` | הגנת שלוחות הטלפון של ימות | ⚠️ **חובה גם להוסיף `?ApiToken=<הערך>` לכתובת ה-Webhook בימות** — אחרת השלוחה פתוחה |
| `RESEND_WEBHOOK_SECRET` | הגנת webhook של מייל נכנס (Resend) | להגדיר גם בצד Resend |

---

## 🗄️ 2. Supabase (חובה)

| משתנה | תיאור |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | כתובת פרויקט Supabase (פומבי) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | מפתח אנונימי (פומבי, מוגן ב-RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | ראה סעיף 1 |

## 🌐 3. כתובות האתר (חובה)

| משתנה | תיאור |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://chasamsofer.co.il` |
| `NEXT_PUBLIC_APP_URL` | `https://chasamsofer.co.il` |

## ☎️ 4. ימות המשיח (טלפוניה)

| משתנה | תיאור |
|---|---|
| `YEMOT_TOKEN` | טוקן API של ימות (לשיחות יוצאות/קמפיינים) |
| `YEMOT_OTP_TEMPLATE_ID` | תבנית קמפיין להקראת קוד כניסה (TTS) |
| `YEMOT_OTP_CALLER_ID` | מספר DID שיוצג בשיחה היוצאת |
| `YEMOT_ANNOUNCE_TEMPLATE_ID` | תבנית שמנגנת הקלטה טבעית (הודעת רישום) = `317067` |
| `YEMOT_WEBHOOK_SECRET` | ראה סעיף 1 |

## 💳 5. נדרים קארד

| משתנה | תיאור |
|---|---|
| `NEDARIM_MOSAD_ID` | קוד מוסד בנדרים (7 ספרות) = `7018265` |
| `NEDARIM_API_PASSWORD` | סיסמת API של נדרים |

> ניתן להגדיר גם דרך המסך: הגדרות → נדרים קארד (נשמר ב-DB, גובר על ה-ENV).

## ✉️ 6. מייל

| משתנה | תיאור |
|---|---|
| `GMAIL_CLIENT_ID` | OAuth של Google (שליחה/גיבוי לדרייב) |
| `GMAIL_CLIENT_SECRET` | OAuth של Google |
| `GMAIL_REDIRECT_URI` | `https://chasamsofer.co.il/api/auth/gmail/callback` |
| `GMAIL_EMAIL` | כתובת השולח |
| `RESEND_API_KEY` | (אופציונלי) שליחת מייל דרך Resend |
| `RESEND_WEBHOOK_SECRET` | ראה סעיף 1 |
| `MAIL_DOMAIN` | דומיין המייל (למשל `chasamsofer.info`) |

## 💾 7. גיבוי ל-Google Drive

| משתנה | תיאור |
|---|---|
| `GOOGLE_DRIVE_BACKUP_FOLDER_ID` | `1wiyyL3kS2FRmrol5NzXS2XIOHEeaeJxi` (משתמש בחיבור ה-OAuth של Gmail) |

## 🔊 8. ElevenLabs (קול טבעי — אופציונלי)

| משתנה | תיאור |
|---|---|
| `ELEVENLABS_API_KEY` | מפתח API |
| `ELEVENLABS_VOICE_ID` | מזהה הקול |
| `ELEVENLABS_MODEL_ID` | מזהה המודל |

## ⚙️ 9. אוטומטי (Railway מגדיר לבד)

`RAILWAY_PUBLIC_DOMAIN` · `NODE_ENV`

---

## ✅ צ'קליסט לפני go-live
1. כל המשתנים בסעיפים 1–6 מוגדרים.
2. הסודות בסעיף 1 הם ערכים אקראיים חזקים (32 בייט), לא ברירת מחדל.
3. `YEMOT_WEBHOOK_SECRET` — הוגדר **גם** בכתובת ה-Webhook בימות (`?ApiToken=...`).
4. Cron יומי לגיבוי מוגדר עם `?secret=<CRON_SECRET>`.
5. גיבוי ידני נבדק ("גבה עכשיו ל-Drive") ועובד.
