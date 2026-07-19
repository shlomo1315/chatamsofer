# תוכנית מימוש: מעגל תיקונים — השלמת מסמכים + תיקון דורות + docs_returned

> **For agentic workers:** מבוצע inline בסשן הנוכחי (המשתמש ביקש מהירות). האפיון:
> `docs/superpowers/specs/2026-07-19-docs-fix-cycle-design.md`

**Goal:** סבב תיקון דו-כיווני — מזכירות שולחת (מסמכים ו/או תיקון עץ דורות), הצאצא משלים הכול בפורטל, וחוזר לסטטוס נפרד `docs_returned` לבדיקה.

**Architecture:** הרחבת המודל הקיים — ערך סטטוס חדש + עמודות על `beneficiaries` (בלי טבלה חדשה). לוגיקת "הושלם הכול?" בפונקציה משותפת אחת בצד שרת.

**Tech:** Next.js 16 / React 19 / Supabase / vitest.

## Global Constraints
- פרודקשן חי; מיגרציות DB מריץ המשתמש ידנית ב-Supabase SQL Editor.
- עברית בכל טקסטי UI/מייל. תווית הסטטוס החדש: "הוחזר תיקון — לבדיקה".
- מעבר ל-docs_returned רק כשהצאצא השלים את **כל** הנדרש.
- אבטחת פורטל: סשן pb_session + השוואת beneficiary_id (IDOR) + rateLimit — כמו upload-docs.

## Tasks

- [ ] **1. מיגרציה** — `supabase/migrations/20260719_docs_fix_cycle.sql`: הרחבת CHECK של eligibility_status ל-docs_returned; עמודות: lineage_fix_required (bool, default false), lineage_fix_note, lineage_fixed_at, lineage_chain_before_fix (jsonb), docs_sent_at, docs_returned_at. (קובץ בלבד — לא מריצים.)
- [ ] **2. types/index.ts** — 'docs_returned' ב-EligibilityStatus + ELIGIBILITY_LABELS; שדות חדשים ב-Beneficiary.
- [ ] **3. lib/docsReturnCheck.ts + test** — `maybeMarkDocsReturned(admin, beneficiaryId)`: אם docs_pending, כל required_docs קיימים ב-documents, ו-(!lineage_fix_required || lineage_fixed_at) → עדכון docs_returned + docs_returned_at + ניקוי required_docs. בדיקות עם mock supabase (בדפוס lineageReliability.test.ts).
- [ ] **4. API פורטל** — upload-docs: החלפת ההחזרה ל-pending בקריאה ל-helper; `docs-complete/route.ts` חדש (מעטפת); `fix-lineage/route.ts` חדש: snapshot ל-lineage_chain_before_fix (רק בפעם הראשונה), יצירת צמתים pending (לוגיקת public-register שורות 229-267), עדכון lineage_node_id/chain/manual + lineage_fixed_at, ואז helper.
- [ ] **5. מייל** — docsPendingEmail: פרמטר lineageFixNote — בלוק "תיקון עץ הדורות" במייל; send-status-email מעביר אותו (קורא lineage_fix_note מה-DB).
- [ ] **6. StatusControl** — סקציית "עץ הדורות דרוש תיקון" במודאל (צ'קבוקס + textarea חובה כשמסומן); שליחה מותרת עם מסמכים או דורות; applyStatus שולח lineage_fix_required/note + docs_sent_at + איפוסים; יציאה מהמעגל מנקה שדות; סגנון docs_returned (teal) + אופציות.
- [ ] **7. רשימת אדמין** — STATUS_KEYS + כרטיס "הוחזרו תיקונים" (teal) + STATUS_CHIP + Filter ב-BeneficiariesTable; StatusBadge.
- [ ] **8. ReturnedFixesBanner** — רכיב server בדף `[id]/page.tsx` בסטטוס docs_returned: מסמכים מאז docs_sent_at + diff שרשרת ישן/חדש (lineage_chain_before_fix מול lineage_chain) + הערת התיקון.
- [ ] **9. פורטל** — BENEFICIARY_SELECT + שדות; מסך docs-needed דו-חלקי (מסמכים + LineageBuilder כשנדרש תיקון, עם הערת המזכירות והשרשרת הישנה); handleDocsUpload/handleFixLineage קוראים ל-API; מקרה "אין קבצים חדשים" → docs-complete; docs_returned מוצג "התיקון התקבל וממתין לבדיקה" בלי חסימות docs_pending.
- [ ] **10. אימות** — `npx tsc --noEmit` (יתפוס כל Record<EligibilityStatus> חסר), `npm test`, סריקת היקרויות docs_pending שנותרו רלוונטיות, commit.
