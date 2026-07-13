import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserPermissions, SectionKey } from '@/types'
import { TABLES, tableByName, schemaFor, type TableSpec } from './schema'

// ─────────────────────────────────────────────────────────────────────────────
// הכלים של העוזר — קריאה בלבד.
//
// במקום כלי לכל שאלה (גישה שתמיד תשאיר פערים), יש כאן שלושה כלים גנריים
// שעובדים מול *רישום הטבלאות* (schema.ts). התוצאה: כל טבלה שנרשמת שם נגישה
// לעוזר מיד — כולל מחלקות שיתווספו בעתיד. אין צורך לגעת בקוד הזה.
//
// ⚠️ ההרשאות נאכפות כאן, בשרת, ולא ע"י המודל. אין כאן שום כלי שכותב.
// ─────────────────────────────────────────────────────────────────────────────

export interface ToolCtx {
  db: SupabaseClient
  perms: UserPermissions
  isAdmin: boolean
}

function canView(ctx: ToolCtx, section: SectionKey): boolean {
  if (ctx.isAdmin) return true
  const lvl = ctx.perms[section]
  return lvl === 'view' || lvl === 'edit' || lvl === 'add'
}

/** האם המשתמש רשאי לגעת בטבלה. */
function allowed(ctx: ToolCtx, spec: TableSpec): boolean {
  if (spec.perm === null) return true          // פתוח לכל הצוות (למשל דואר)
  return canView(ctx, spec.perm)
}

/** תיאור כל הטבלאות שהמשתמש רשאי לראות — נשלח למודל בהנחיה. */
export function schemaForUser(ctx: ToolCtx): string {
  return schemaFor(s => canView(ctx, s), ctx.isAdmin)
}

/**
 * מה העוזר עושה כרגע — מוצג למשתמש בזמן ההמתנה, במקום ספינר מת.
 * הניסוח נגזר מהכלי ומהטבלה בפועל, כך שהוא תמיד נכון.
 */
export function activityLabel(name: string, input: Record<string, unknown>): string {
  const spec = tableByName(String(input.table ?? ''))
  const what = spec?.label ?? 'הנתונים'

  switch (name) {
    case 'get_overview':
      return 'עוזר בודק מה ממתין לך בכל האגפים…'
    case 'count_data':
      if (input.group_by) return `עוזר מפלח את ${what}…`
      return `עוזר סופר את ${what}…`
    case 'query_data':
      if (input.search) return `עוזר מחפש "${String(input.search)}"…`
      if (input.status) return `עוזר בודק את ${what}…`
      return `עוזר שולף את ${what}…`
    default:
      return 'עוזר עובד…'
  }
}

// ─── הגדרות הכלים ────────────────────────────────────────────────────────────

export const TOOL_DEFS = [
  {
    name: 'query_data',
    description:
      'שולף רשומות מכל טבלה במערכת. זה הכלי הראשי — השתמש בו לכל שאלה על נתונים. ' +
      'רשימת הטבלאות והעמודות שלהן מופיעה בהנחיה. אפשר לסנן לפי סטטוס, לפי טווח ימים, ' +
      'ולחפש טקסט חופשי.',
    input_schema: {
      type: 'object' as const,
      properties: {
        table: { type: 'string', description: 'שם הטבלה, בדיוק כפי שמופיע ברשימה בהנחיה' },
        search: { type: 'string', description: 'חיפוש טקסט חופשי (שם, נושא, עיר). מחפש מילה-מילה, כך ש"שלמה ויסברג" ימצא גם כששם פרטי ומשפחה בשדות נפרדים.' },
        status: { type: 'string', description: 'סינון לפי סטטוס, למשל pending' },
        days: { type: 'number', description: 'רק רשומות מ-N הימים האחרונים. 1 = היום.' },
        limit: { type: 'number', description: 'כמה להחזיר (ברירת מחדל 25, מקסימום 100)' },
      },
      required: ['table'],
    },
  },
  {
    name: 'count_data',
    description:
      'סופר רשומות בטבלה, עם אותם סינונים כמו query_data. השתמש בזה כשמספיק מספר ' +
      '("כמה נרשמו השבוע?") — זה מהיר בהרבה משליפת הרשומות עצמן. ' +
      'אפשר גם לקבל פילוח לפי עמודה (group_by), למשל כמה בכל סטטוס או בכל בית החלמה.',
    input_schema: {
      type: 'object' as const,
      properties: {
        table: { type: 'string', description: 'שם הטבלה' },
        status: { type: 'string' },
        days: { type: 'number' },
        search: { type: 'string' },
        group_by: { type: 'string', description: 'עמודה לפילוח, למשל status / recovery_home / to_email' },
      },
      required: ['table'],
    },
  },
  {
    name: 'get_overview',
    description:
      'תמונת מצב כוללת של כל המערכת בקריאה אחת: כמה ממתין לטיפול בכל אגף, כמה נרשמו ' +
      'לאחרונה, דואר שלא נקרא. השתמש בזה לשאלות כמו "מה המצב?", "מה ממתין לי?", ' +
      '"תן לי סיכום". מהיר — עדיף על מספר קריאות ל-count_data.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
]

// ─── מימוש ───────────────────────────────────────────────────────────────────

function sinceISO(days?: number): string | null {
  const d = Number(days)
  if (!d || d <= 0) return null
  const t = new Date()
  t.setHours(0, 0, 0, 0)                       // "היום" = מתחילת היום, לא 24 שעות אחורה
  t.setDate(t.getDate() - (d - 1))
  return t.toISOString()
}

const BEN_JOIN = 'beneficiary:beneficiaries(family_name, full_name, spouse_name, id_number, phone, city)'

/** בונה שאילתה עם כל הסינונים. משותף ל-query ול-count. */
function buildQuery(
  db: SupabaseClient,
  spec: TableSpec,
  input: Record<string, unknown>,
  select: string,
  countOnly = false,
) {
  let q = countOnly
    ? db.from(spec.table).select(select, { count: 'exact', head: true })
    : db.from(spec.table).select(select)

  if (input.status && spec.statusCol) {
    q = q.eq(spec.statusCol, String(input.status))
  }

  const since = sinceISO(Number(input.days))
  if (since && spec.dateCol) {
    q = q.gte(spec.dateCol, since)
  }

  return q
}

/**
 * חיפוש טקסט. קריטי: המשתמש כותב "שלמה ויסברג", אבל במסד השם הפרטי ושם
 * המשפחה בשדות נפרדים — ולכן ILIKE על המחרוזת השלמה לא מתאים לאף שדה.
 * מחפשים מילה-מילה, ואז מדרגים לפי כמה מילים תאמו.
 */
async function searchRows(
  db: SupabaseClient,
  spec: TableSpec,
  term: string,
  input: Record<string, unknown>,
  select: string,
  limit: number,
): Promise<Record<string, unknown>[]> {
  const cols = spec.searchCols ?? []
  if (!cols.length) return []

  // ת"ז / מספר — התאמה מדויקת
  const digits = term.replace(/\D/g, '')
  if (digits.length >= 7 && spec.columns.includes('id_number')) {
    const idFilter = spec.columns.includes('spouse_id_number')
      ? `id_number.eq.${digits},spouse_id_number.eq.${digits}`
      : `id_number.eq.${digits}`
    const { data } = await buildQuery(db, spec, input, select).or(idFilter).limit(limit)
    if (data?.length) return data as never
  }

  const words = term.split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length >= 2 && !['הרב', 'רבי', 'מרת', 'של'].includes(w))
  if (!words.length) return []

  const hits = new Map<string, Record<string, unknown>>()
  for (const w of words) {
    const or = cols.map(c => `${c}.ilike.%${w}%`).join(',')
    const { data } = await buildQuery(db, spec, input, select).or(or).limit(60)
    for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
      hits.set(String(r.id ?? JSON.stringify(r)), r)
    }
  }
  if (!hits.size) return []

  // דירוג: התאמה ליותר מילים = רלוונטי יותר
  const scored = [...hits.values()].map(r => {
    const hay = cols.map(c => String(r[c] ?? '')).join(' ').toLowerCase()
    return { r, score: words.filter(w => hay.includes(w.toLowerCase())).length }
  }).sort((a, b) => b.score - a.score)

  const best = scored[0].score
  return scored.filter(s => s.score === best).slice(0, limit).map(s => s.r)
}

export async function runTool(ctx: ToolCtx, name: string, input: Record<string, unknown>): Promise<unknown> {
  const { db } = ctx

  switch (name) {
    // ── שליפת רשומות ────────────────────────────────────────────────────────
    case 'query_data': {
      const spec = tableByName(String(input.table ?? ''))
      if (!spec) {
        return { error: `הטבלה "${input.table}" אינה קיימת. הטבלאות הזמינות מופיעות בהנחיה.` }
      }
      if (!allowed(ctx, spec)) {
        return { error: `אין לך הרשאה לצפות ב${spec.label}.` }
      }

      const limit = Math.min(Math.max(Number(input.limit) || 25, 1), 100)
      const select = spec.joinBeneficiary
        ? `${spec.columns.join(', ')}, ${BEN_JOIN}`
        : spec.columns.join(', ')

      /** מצרף לכל רשומה קישור ישיר לכרטסת שלה במערכת. */
      const withLinks = (rows: Record<string, unknown>[]) =>
        spec.route
          ? rows.map(r => ({ ...r, קישור: spec.route!.replace('{id}', String(r.id)) }))
          : rows

      const term = String(input.search ?? '').trim()
      if (term) {
        const rows = await searchRows(db, spec, term, input, select, limit)
        if (!rows.length) return { message: `לא נמצאו תוצאות עבור "${term}" ב${spec.label}` }
        return { טבלה: spec.label, נמצאו: rows.length, רשומות: withLinks(rows) }
      }

      let q = buildQuery(db, spec, input, select)
      if (spec.dateCol) q = q.order(spec.dateCol, { ascending: false })

      const { data, error } = await q.limit(limit)
      if (error) {
        console.error('[assistant] query_data:', spec.table, error.message)
        return { error: 'שגיאה בשליפת הנתונים' }
      }
      if (!data?.length) return { message: `לא נמצאו רשומות ב${spec.label}` }
      return {
        טבלה: spec.label,
        נמצאו: data.length,
        רשומות: withLinks(data as unknown as Record<string, unknown>[]),
      }
    }

    // ── ספירה ופילוח ────────────────────────────────────────────────────────
    case 'count_data': {
      const spec = tableByName(String(input.table ?? ''))
      if (!spec) return { error: `הטבלה "${input.table}" אינה קיימת.` }
      if (!allowed(ctx, spec)) return { error: `אין לך הרשאה לצפות ב${spec.label}.` }

      const groupBy = String(input.group_by ?? '').trim()

      if (groupBy) {
        if (!spec.columns.includes(groupBy)) {
          return { error: `העמודה "${groupBy}" אינה קיימת ב${spec.label}.` }
        }
        // שולפים רק את עמודת הפילוח וסופרים בצד שלנו
        const { data, error } = await buildQuery(db, spec, input, groupBy).limit(2000)
        if (error) return { error: 'שגיאה בשליפת הנתונים' }

        const counts: Record<string, number> = {}
        for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
          const k = r[groupBy] == null || r[groupBy] === '' ? '(ריק)' : String(r[groupBy])
          counts[k] = (counts[k] ?? 0) + 1
        }
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
        return { טבלה: spec.label, פילוח_לפי: groupBy, סהכ: data?.length ?? 0, תוצאות: Object.fromEntries(sorted) }
      }

      const { count, error } = await buildQuery(db, spec, input, 'id', true)
      if (error) return { error: 'שגיאה בספירה' }
      return { טבלה: spec.label, כמות: count ?? 0 }
    }

    // ── תמונת מצב כוללת ─────────────────────────────────────────────────────
    case 'get_overview': {
      const out: Record<string, unknown> = {}

      // כל הספירות במקביל — סדרתי היה איטי מאוד
      const jobs: Promise<void>[] = []

      const bens = tableByName('beneficiaries')!
      if (allowed(ctx, bens)) {
        jobs.push((async () => {
          const [total, week, pending, docs] = await Promise.all([
            db.from('beneficiaries').select('id', { count: 'exact', head: true }),
            db.from('beneficiaries').select('id', { count: 'exact', head: true }).gte('created_at', sinceISO(7)!),
            db.from('beneficiaries').select('id', { count: 'exact', head: true }).eq('eligibility_status', 'pending'),
            db.from('beneficiaries').select('id', { count: 'exact', head: true }).eq('eligibility_status', 'docs_pending'),
          ])
          out['משפחות'] = {
            סהכ: total.count ?? 0,
            נרשמו_השבוע: week.count ?? 0,
            ממתינות_לאישור: pending.count ?? 0,
            ממתינות_למסמכים: docs.count ?? 0,
          }
        })())
      }

      // בקשות ממתינות בכל אגף שיש בו סטטוס
      for (const spec of TABLES) {
        if (!spec.statusCol || spec.table === 'beneficiaries' || spec.table === 'campaigns') continue
        if (!allowed(ctx, spec)) continue
        jobs.push((async () => {
          const { count } = await db.from(spec.table)
            .select('id', { count: 'exact', head: true })
            .eq(spec.statusCol!, 'pending')
          if (count) out[spec.label] = { ממתינות_לאישור: count }
        })())
      }

      // דואר
      jobs.push((async () => {
        const [today, unread] = await Promise.all([
          db.from('inbound_emails').select('id', { count: 'exact', head: true }).gte('created_at', sinceISO(1)!),
          db.from('inbound_emails').select('id', { count: 'exact', head: true }).eq('is_read', false),
        ])
        out['דואר'] = { התקבלו_היום: today.count ?? 0, לא_נקראו: unread.count ?? 0 }
      })())

      await Promise.all(jobs)

      if (!Object.keys(out).length) return { error: 'אין לך הרשאות צפייה לאף אגף.' }
      return out
    }

    default:
      return { error: `כלי לא מוכר: ${name}` }
  }
}
