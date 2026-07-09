# לשונית ארכיון מייל קודם — תוכנית מימוש

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** לשונית "ארכיון מייל קודם" בממשק המייל (משויכים/לא-משויכים), שיוך ידני ללקוח, והכנסת המיילים לתיבת Gmail של office עם תווית.

**Architecture:** תיקייה חדשה 'LEGACY' ב-MailClient; route ה-messages מחזיר source='legacy' לתיקייה זו עם סינון assigned/unassigned; endpoint שיוך ידני שמעדכן beneficiary_id; syncLegacyMail מכניס כל מייל גם לתיבת office דרך gmail.messages.insert עם תווית.

**Tech Stack:** Next.js App Router · TypeScript · Supabase · googleapis · React

## Global Constraints
- כל route תחת /api/admin/* מוגן ב-requireStaff().
- טקסט למשתמש בעברית.
- אין בדיקות בפרויקט — אימות = `npx tsc --noEmit`.
- הזרימה הקיימת (source='resend' בתיבה התפעולית) לא נשברת.
- טבלת inbound_emails הקיימת; מיילי legacy מזוהים ב-source='legacy'.

---

## Task 1: route ה-messages — תמיכה בתיקיית LEGACY עם סינון משויכים/לא-משויכים

**Files:**
- Modify: `app/api/admin/mail/messages/route.ts:96-105`

**Interfaces:**
- Consumes: query param `folder` (קיים), param חדש `sub` ('assigned'|'unassigned', אופציונלי).
- Produces: כשfolder='LEGACY' → מחזיר inbound_emails עם source='legacy'; sub מסנן לפי beneficiary_id.

- [ ] **Step 1: עדכן את ענף הדואר הנכנס**

בקובץ, שורות 96-105 (ענף "דואר נכנס / ספאם"). כרגע:
```ts
  let query = admin.from('inbound_emails').select('*').order('received_at', { ascending: false }).limit(50)
  query = folder === 'SPAM' ? query.eq('is_spam', true) : query.eq('is_spam', false)
  query = query.eq('source', 'resend')
```
החלף ב:
```ts
  const isLegacy = folder === 'LEGACY'
  let query = admin.from('inbound_emails').select('*').order('received_at', { ascending: false }).limit(50)
  if (isLegacy) {
    query = query.eq('source', 'legacy')
    // סינון פנימי: משויכים / לא-משויכים (sub מגיע מה-UI)
    const sub = req.nextUrl.searchParams.get('sub')
    if (sub === 'assigned') query = query.not('beneficiary_id', 'is', null)
    else if (sub === 'unassigned') query = query.is('beneficiary_id', null)
  } else {
    query = folder === 'SPAM' ? query.eq('is_spam', true) : query.eq('is_spam', false)
    query = query.eq('source', 'resend')
  }
```
הערה: מיילי legacy אינם מסוננים לפי to_email/department (הם מהתיבה הישנה). ודא שהמסנן `effectiveEmails` בהמשך (שורות 101-102) **מדולג** ל-legacy — עטוף אותו ב-`if (!isLegacy)`. ודא ש-`req` נגיש בהיקף (שם הפרמטר של הפונקציה — בדוק בראש ה-handler; אם `request` — השתמש בו).

- [ ] **Step 2: הוסף beneficiary_id לפלט ה-message**

באובייקט ה-message שנבנה (סביב שורה 107+), הוסף שדה `beneficiaryId: m.beneficiary_id ?? null` כדי שה-UI ידע אילו משויכים.

- [ ] **Step 3: אימות + Commit**

Run: `npx tsc --noEmit` → ריק.
```bash
git add app/api/admin/mail/messages/route.ts
git commit -m "feat: תיקיית LEGACY ב-route המיילים עם סינון משויכים/לא-משויכים

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: endpoint שיוך ידני של מייל ללקוח

**Files:**
- Create: `app/api/admin/mail/assign-beneficiary/route.ts`

**Interfaces:**
- Consumes: `requireStaff`, `unauthorized` (@/lib/apiAuth); admin client (דפוס מ-resend-inbound).
- Produces: `POST` body `{ messageId: string, beneficiaryId: string | null }` → מעדכן inbound_emails.beneficiary_id → `{ ok: true }`. beneficiaryId=null מבטל שיוך.

- [ ] **Step 1: הקובץ**

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff, unauthorized } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(req: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()
  let body: { messageId?: string; beneficiaryId?: string | null }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  if (!body.messageId) return NextResponse.json({ error: 'חסר מזהה הודעה' }, { status: 400 })
  const { error } = await admin().from('inbound_emails')
    .update({ beneficiary_id: body.beneficiaryId ?? null })
    .eq('id', body.messageId)
  if (error) return NextResponse.json({ error: 'שגיאה בשיוך' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: אימות + Commit**

Run: `npx tsc --noEmit` → ריק.
```bash
git add app/api/admin/mail/assign-beneficiary/route.ts
git commit -m "feat: endpoint שיוך ידני של מייל היסטורי ללקוח

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: UI — תיקיית LEGACY, sub-tabs, וכפתור שיוך

**Files:**
- Modify: `app/admin/mail/MailClient.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/mail/messages?folder=LEGACY&sub=...` (Task 1), `POST /api/admin/mail/assign-beneficiary` (Task 2), `GET /api/admin/beneficiary-search?q=...` (קיים).
- Produces: תיקייה 'LEGACY' + sub-tabs + מודל שיוך.

- [ ] **Step 1: הוסף תיקייה ל-FOLDER_ITEMS**

בשורה 39-44, הוסף פריט (ה-icon `Archive` מ-lucide-react — ודא שמיובא, אם לא הוסף לייבוא):
```ts
  { key: 'LEGACY', label: 'ארכיון מייל קודם', icon: Archive },
```

- [ ] **Step 2: sub-tabs משויכים/לא-משויכים**

כשהתיקייה הפעילה היא 'LEGACY', הצג מעל רשימת המיילים שתי לשוניות משנה: "לא משויכים" ו"משויכים". החזק state `legacySub` ('unassigned' ברירת מחדל). כששוברים tab — טען מחדש עם `?folder=LEGACY&sub=${legacySub}`. חבר ל-fetch הקיים של המיילים (מצא איפה נטענים messages לפי folder והוסף את פרמטר sub כשfolder==='LEGACY').

מבנה מוצע (התאם למבנה ה-JSX הקיים):
```tsx
{folder === 'LEGACY' && (
  <div className="flex gap-2 px-3 py-2 border-b border-slate-100">
    <button onClick={() => setLegacySub('unassigned')} className={legacySub==='unassigned' ? 'font-bold text-indigo-600' : 'text-slate-500'}>לא משויכים</button>
    <button onClick={() => setLegacySub('assigned')} className={legacySub==='assigned' ? 'font-bold text-indigo-600' : 'text-slate-500'}>משויכים</button>
  </div>
)}
```

- [ ] **Step 3: כפתור "שייך ללקוח" על מיילים לא-משויכים**

על כל מייל בתיקיית LEGACY שאין לו beneficiaryId, הצג כפתור "שייך ללקוח". בלחיצה — פתח מודל חיפוש: input שמפעיל `GET /api/admin/beneficiary-search?q=<text>` (בדוק את מבנה התשובה של ה-endpoint — קרא `app/api/admin/beneficiary-search/route.ts` לפני מימוש), הצג תוצאות, ובבחירה קרא `POST /api/admin/mail/assign-beneficiary` עם { messageId, beneficiaryId }, ואז רענן את הרשימה. השתמש ב-`useToast` הקיים להצלחה/שגיאה.

- [ ] **Step 4: אימות + Commit**

Run: `npx tsc --noEmit` → ריק.
```bash
git add app/admin/mail/MailClient.tsx
git commit -m "feat: לשונית ארכיון מייל קודם עם שיוך ידני ללקוח

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: הכנסת מיילי legacy לתיבת Gmail של office עם תווית

**Files:**
- Modify: `lib/legacyMailSync.ts`
- Modify: `lib/gmail.ts` (אם צריך helper insert)

**Interfaces:**
- Consumes: `getGmailClient` (office, מ-lib/gmail — scope gmail.modify), `ensureLabel` (קיים).
- Produces: syncLegacyMail מכניס כל מייל חדש לתיבת office עם תווית "ארכיון מייל קודם". כשל ב-Gmail לא שובר את שמירת ה-DB.

- [ ] **Step 1: הוסף הכנסה ל-Gmail ב-syncLegacyMail**

ב-`lib/legacyMailSync.ts`, בתוך `syncLegacyMail`: לפני הלולאה, קבל את office client ואת ה-labelId פעם אחת (עם try/catch — אם office לא מחובר, דלג על כל שלב ה-Gmail בלי לשבור):
```ts
import { getGmailClient, ensureLabel } from './gmail'
// ... בתוך syncLegacyMail, לפני do/while:
let officeGmail: any = null, archiveLabelId: string | null = null
try {
  officeGmail = await getGmailClient()
  archiveLabelId = await ensureLabel(officeGmail, 'ארכיון מייל קודם')
} catch (e) { console.error('[legacy-sync] office Gmail unavailable, skipping archive copy:', e) }
```
ובתוך הלולאה, **רק עבור מייל שיובא בהצלחה** (imported=true), אחרי ה-push: הכנס עותק גולמי לתיבת office עם התווית. השתמש ב-raw מ-full.data.raw אם קיים, או בנה MIME בסיסי. עטוף ב-try/catch נפרד:
```ts
if (imported && officeGmail && archiveLabelId) {
  try {
    const rawFull = await gmail.users.messages.get({ userId: 'me', id, format: 'raw' })
    if (rawFull.data.raw) {
      await officeGmail.users.messages.insert({
        userId: 'me',
        requestBody: { raw: rawFull.data.raw, labelIds: [archiveLabelId] },
      })
    }
  } catch (e) { console.error(`[legacy-sync] Gmail insert failed for ${id}:`, e) }
}
```
הערה: `messages.insert` עם raw base64url מ-Gmail get(format:'raw') תואם ישירות. התווית מוחלת דרך labelIds.

- [ ] **Step 2: מניעת כפילות ב-Gmail**

אם המשיכה רצה שוב, מייל שכבר יובא (imported=false, duplicate) **לא** יגיע לתנאי `if (imported...)` — אז לא ייווצר עותק כפול ב-Gmail. תקין. (התיעוד: ההכנסה תלויה ב-imported, שהוא true רק לשורות DB חדשות.)

- [ ] **Step 3: אימות + Commit**

Run: `npx tsc --noEmit` → ריק (ודא ש-getGmailClient/ensureLabel מיוצאים מ-lib/gmail — קרא לוודא).
```bash
git add lib/legacyMailSync.ts lib/gmail.ts
git commit -m "feat: הכנסת מיילי ארכיון לתיבת Gmail של office עם תווית

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: אימות end-to-end + PR

- [ ] `npx tsc --noEmit` על כל ה-branch — ריק.
- [ ] דחיפה + PR מול main (branch feat/legacy-mail-ui, מבודד).
- [ ] אימות חי אחרי פריסה: תיקיית "ארכיון מייל קודם" מופיעה, sub-tabs עובדים, שיוך ידני עובד, ומיילים מופיעים בתיבת Gmail עם תווית.
