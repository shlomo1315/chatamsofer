# תוכנית מימוש: ייבוא מיילים ל-Google Workspace

> מבוצע inline. אפיון: `docs/superpowers/specs/2026-07-19-workspace-archive-import-design.md`

**Goal:** הזרקת מיילים ישנים לתיבות ה-Gmail של המחלקות דרך Service Account (Domain-wide delegation).

**Architecture:** ההזרקה לתיבת המחלקה נעשית **בזמן הסנכרון** (כש-raw כבר בהישג יד — הקוד כבר מושך raw להזרקה ל-office). לקוח Workspace דרך JWT+impersonation. סימון פר-מייל למניעת כפילות.

**Tech:** googleapis (JWT), Supabase, Next.js.

## Global Constraints
- Domain-wide delegation, scope `gmail.insert`. סוד `GOOGLE_SA_KEY` (JSON) ב-env.
- רק admin מפעיל. פרודקשן חי; מיגרציה ידנית.
- אם `GOOGLE_SA_KEY` לא מוגדר — הפיצ'ר מושבת בשקט (לא שובר סנכרון קיים).

## Tasks

- [ ] **1. מיגרציה** — `20260719_gmail_import_tracking.sql`: `imported_to_gmail_at timestamptz` + index על inbound_emails. (קובץ בלבד.)
- [ ] **2. lib/googleWorkspace.ts + test** — `getWorkspaceGmailClient(mailboxEmail)` (JWT מ-GOOGLE_SA_KEY, subject=mailboxEmail, scope gmail.insert), `isWorkspaceConfigured()`, `ensureArchiveLabel(gmail)`, `importRawMessage(gmail, rawBase64, labelId)` (messages.import, internalDateSource: dateHeader). בדיקת יחידה: בניית JWT עם subject נכון + isWorkspaceConfigured (mock/env).
- [ ] **3. שילוב בסנכרון** — ב-legacyMailSync, כשמזריק raw: בנוסף ל-office, אם workspace מוגדר ולמחלקת התיבה יש email — מזריק גם לתיבת המחלקה עם תווית "ארכיון מייל ישן", ומסמן imported_to_gmail_at. לא חוסם (try/catch).
- [ ] **4. route ייבוא בדיעבד** — `app/api/admin/legacy-mail/import-to-gmail/route.ts`: requireAdmin, קלט {accountId}, שולף מיילים legacy של המחלקה עם imported_to_gmail_at null, מושך raw מהמקור (getGmailClientForToken של התיבה), מזריק לתיבת המחלקה, מסמן. מחזיר {imported, skipped, failed}. באצ'ים.
- [ ] **5. UI** — כפתור "ייבא ל-Gmail" בכל תיבה ב-LegacyMailSettings (כמו applyLabel).
- [ ] **6. tsc + בדיקות + סקירה אדוורסרית + דחיפה.**
