// לוגיקה טהורה של דף עריכת הצאצא (נבדקת ב-editLogic.test.ts)

/** 1988-03-14 ← 14.03.1988 (לתצוגה) */
export function isoToDmy(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  return m ? `${m[3]}.${m[2]}.${m[1]}` : ''
}

/** 14.03.1988 ← 1988-03-14. מחזיר null כשהתאריך לא תקין (גם 31.02). ריק → '' */
export function dmyToIso(dmy: string): string | null {
  const t = dmy.trim()
  if (!t) return ''
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(t)
  if (!m) return null
  const d = +m[1], mo = +m[2], y = +m[3]
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export interface FieldDef { key: string; label: string; section: 's1' | 's2' | 's3' | 's4' | 's5' | 's6' }

export interface Change { label: string; section: FieldDef['section'] }

/** שדות שהשתנו מול הערכים המקוריים, לפי סדר ההגדרה. */
export function diffFields(defs: FieldDef[], orig: Record<string, string>, cur: Record<string, string>): Change[] {
  return defs.filter(d => (cur[d.key] ?? '').trim() !== (orig[d.key] ?? '').trim()).map(d => ({ label: d.label, section: d.section }))
}

/** הסרת אחרי שמירה: ת.ז. ישראלית → ספרות בלבד, דרכון כמו שהוא */
export function normalizeId(raw: string, docType: 'id' | 'passport'): string {
  return docType === 'id' ? raw.replace(/\D/g, '') : raw.trim()
}
