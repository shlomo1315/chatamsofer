// הגדרת שלוש המערכות הטלפוניות והאימות של כל אחת.
//
// 🔴 הפרדה מלאה: לכל מערכת משתני סביבה משלה (TECHNOLINE_<MAIN|YERID|DISTRIBUTORS>_*),
// סוד משלה בנתיב ה-URL, ומספר משלה. סוד של מערכת אחת לא מתקבל באחרת.
// הלקח מהמרכזיה: טוקן משותף אחד הפיל את שלוחת היריד.
//
// המרכזיה של טכנוליין אינה שולחת כותרת אימות, ולכן הסוד נמצא בתוך ה-URL.
import { timingSafeEqual } from 'node:crypto'
import type { TelephonySystemId } from './types'

export const SYSTEM_IDS: TelephonySystemId[] = ['main', 'yerid', 'distributors']

export const SYSTEM_LABELS: Record<TelephonySystemId, string> = {
  main: 'מערכת ראשית',
  yerid: 'יריד ספרים',
  distributors: 'מפיצים',
}

const PREFIX: Record<TelephonySystemId, string> = {
  main: 'TECHNOLINE_MAIN',
  yerid: 'TECHNOLINE_YERID',
  distributors: 'TECHNOLINE_DISTRIBUTORS',
}

/** חשבון טכנוליין אחד לכל המערכות: מפתח חשבון, תקרה חודשית ודגל הפעלת שיחות יוצאות. */
export function accountConfig() {
  const cap = Number(process.env.TECHNOLINE_MONTHLY_CAP)
  return {
    accountKey: process.env.TECHNOLINE_ACCOUNT_KEY?.trim() || null,
    /** תקרה חודשית (בש"ח) לרכישת מספרים; 0 או חסר = אין רכישה */
    monthlyCap: Number.isFinite(cap) && cap > 0 ? cap : 0,
    /** שיחות יוצאות כבויות עד שה-IP של השרת מאושר בטכנוליין */
    outboundEnabled: process.env.TECHNOLINE_OUTBOUND_ENABLED === 'true',
  }
}

export type SystemConfig = {
  id: TelephonySystemId
  label: string
  secret: string | null
  apiKey: string | null
  /** המספר הראשי של המערכת (PBXnum / PBXdid) — לאימות נוסף כשמוגדר */
  number: string | null
  callerId: string | null
}

function env(id: TelephonySystemId, name: string): string | null {
  const v = process.env[`${PREFIX[id]}_${name}`]
  return v && v.trim() ? v.trim() : null
}

export function isSystemId(v: string): v is TelephonySystemId {
  return (SYSTEM_IDS as string[]).includes(v)
}

export function getSystem(id: TelephonySystemId): SystemConfig {
  return {
    id, label: SYSTEM_LABELS[id],
    secret: env(id, 'SECRET'), apiKey: env(id, 'API_KEY'),
    number: env(id, 'NUMBER'), callerId: env(id, 'CALLER_ID'),
  }
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

/** מערכות שחולקות את אותו סוד — מצב אסור, ונחסם (fail-closed). */
export function sharedSecretSystems(): TelephonySystemId[] {
  const seen = new Map<string, TelephonySystemId[]>()
  for (const id of SYSTEM_IDS) {
    const s = getSystem(id).secret
    if (s) seen.set(s, [...(seen.get(s) ?? []), id])
  }
  return [...seen.values()].filter((l) => l.length > 1).flat()
}

/**
 * אימות בקשה נכנסת: הסוד שבנתיב חייב להתאים לסוד של *אותה* מערכת בלבד.
 * סוד חסר, או סוד משותף לכמה מערכות — נדחה.
 */
export function verifyRequest(id: TelephonySystemId, secret: string, pbxNumber?: string): boolean {
  const cfg = getSystem(id)
  if (!cfg.secret) return false
  if (sharedSecretSystems().includes(id)) return false
  if (!safeEqual(secret, cfg.secret)) return false
  // אם הוגדר מספר למערכת והמרכזיה שלחה PBXdid — חייבים להתאים (מונע ערבוב בין מספרים)
  if (cfg.number && pbxNumber && pbxNumber.replace(/\D/g, '') !== cfg.number.replace(/\D/g, '')) return false
  return true
}

/** מה מוגדר ומה חסר — להצגה במסך הניהול (בלי לחשוף ערכים). */
export function systemStatus(id: TelephonySystemId) {
  const c = getSystem(id)
  return {
    id, label: c.label,
    hasSecret: !!c.secret, hasApiKey: !!c.apiKey, hasNumber: !!c.number,
    missing: [
      !c.secret && `${PREFIX[id]}_SECRET`,
      !c.apiKey && `${PREFIX[id]}_API_KEY`,
      !c.number && `${PREFIX[id]}_NUMBER`,
    ].filter(Boolean) as string[],
  }
}
