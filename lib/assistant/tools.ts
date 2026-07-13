import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserPermissions, SectionKey } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// הכלים שהעוזר יכול להפעיל — קריאה בלבד.
//
// ⚠️ עקרון האבטחה: ההרשאות נאכפות *כאן*, בשרת, ולא ע"י המודל. המודל יכול
// לבקש כל דבר; אם למשתמש אין הרשאה לאותו אגף, הכלי מחזיר שגיאה ולא נתונים.
// מזכירה של אגף אחד לא תוכל לשאוב מידע מאגף אחר דרך העוזר.
//
// אין כאן שום כלי שכותב, מעדכן או מוחק. הסוכן אינו יכול לשנות דבר.
// ─────────────────────────────────────────────────────────────────────────────

export interface ToolCtx {
  db: SupabaseClient
  perms: UserPermissions
  isAdmin: boolean
}

/** האם למשתמש יש גישת צפייה לאגף. */
function canView(ctx: ToolCtx, section: SectionKey): boolean {
  if (ctx.isAdmin) return true
  const lvl = ctx.perms[section]
  return lvl === 'view' || lvl === 'edit' || lvl === 'add'
}

function deny(section: string) {
  return { error: `אין לך הרשאה לצפות בנתוני ${section}. פנה למנהל המערכת.` }
}

// ─── הגדרות הכלים (נשלחות למודל) ────────────────────────────────────────────

export const TOOL_DEFS = [
  {
    name: 'get_dashboard',
    description: 'סיכום כללי של המערכת: כמה בקשות ממתינות לאישור בכל אגף, כמה נרשמו לאחרונה, כמה תיקים פעילים. השתמש בזה לשאלות כמו "מה המצב?" או "מה ממתין לי?".',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_pending_tasks',
    description: 'רשימת כל המשימות שממתינות לטיפול: בקשות שלא אושרו, מסמכים חסרים, כרטיסים שממתינים. השתמש בזה לשאלות כמו "מה אני צריך לעשות?" או "מה דחוף?".',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'count_registrations',
    description: 'כמה משפחות נרשמו בטווח זמן. לשאלות כמו "כמה נרשמו היום/השבוע/החודש?".',
    input_schema: {
      type: 'object' as const,
      properties: {
        days: { type: 'number', description: 'כמה ימים אחורה לספור. 1 = היום, 7 = השבוע האחרון, 30 = החודש.' },
      },
      required: ['days'],
    },
  },
  {
    name: 'search_beneficiary',
    description: 'חיפוש משפחה לפי שם או תעודת זהות. מחזיר את הפרטים והסטטוס.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'שם משפחה, שם פרטי, או מספר תעודת זהות' },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_requests',
    description: 'רשימת בקשות באגף מסוים, עם אפשרות לסנן לפי סטטוס.',
    input_schema: {
      type: 'object' as const,
      properties: {
        section: {
          type: 'string',
          enum: ['maternity', 'loans', 'financial_aid', 'widows'],
          description: 'האגף: maternity=יולדות, loans=הלוואות, financial_aid=סיוע רפואי, widows=אלמנות',
        },
        status: { type: 'string', description: 'סטטוס לסינון, למשל pending (ממתין). השאר ריק לכל הסטטוסים.' },
        limit: { type: 'number', description: 'כמה תוצאות להחזיר (ברירת מחדל 20)' },
      },
      required: ['section'],
    },
  },
  {
    name: 'get_stats',
    description: 'סטטיסטיקה מספרית על אגף: כמה בקשות, סכומים כוללים, פילוח לפי סטטוס.',
    input_schema: {
      type: 'object' as const,
      properties: {
        section: {
          type: 'string',
          enum: ['maternity', 'loans', 'financial_aid', 'widows', 'beneficiaries'],
        },
        days: { type: 'number', description: 'טווח בימים. השאר ריק לכל הזמנים.' },
      },
      required: ['section'],
    },
  },
]

// ─── מימוש ───────────────────────────────────────────────────────────────────

const SECTION_TABLE: Record<string, { table: string; perm: SectionKey; label: string }> = {
  maternity: { table: 'maternity_aids', perm: 'maternity', label: 'יולדות' },
  loans: { table: 'loans', perm: 'loans', label: 'הלוואות' },
  financial_aid: { table: 'financial_aid_requests', perm: 'financial_aid', label: 'סיוע רפואי' },
  widows: { table: 'widow_requests', perm: 'widows', label: 'אלמנות ויתומים' },
  beneficiaries: { table: 'beneficiaries', perm: 'beneficiaries', label: 'משפחות' },
}

function sinceISO(days?: number): string | null {
  if (!days || days <= 0) return null
  return new Date(Date.now() - days * 86400000).toISOString()
}

export async function runTool(ctx: ToolCtx, name: string, input: Record<string, unknown>): Promise<unknown> {
  const { db } = ctx

  switch (name) {
    // ── סיכום כללי ──────────────────────────────────────────────────────────
    case 'get_dashboard': {
      const out: Record<string, unknown> = {}

      if (canView(ctx, 'beneficiaries')) {
        const { count: total } = await db.from('beneficiaries').select('*', { count: 'exact', head: true })
        const { count: week } = await db.from('beneficiaries')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', sinceISO(7)!)
        const { count: pending } = await db.from('beneficiaries')
          .select('*', { count: 'exact', head: true })
          .eq('eligibility_status', 'pending')
        out.משפחות = { סהכ: total ?? 0, נרשמו_השבוע: week ?? 0, ממתינות_לאישור: pending ?? 0 }
      }

      for (const [key, cfg] of Object.entries(SECTION_TABLE)) {
        if (key === 'beneficiaries' || !canView(ctx, cfg.perm)) continue
        const { count: pending } = await db.from(cfg.table)
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending')
        out[cfg.label] = { ממתינות_לאישור: pending ?? 0 }
      }

      if (!Object.keys(out).length) return { error: 'אין לך הרשאות צפייה לאף אגף.' }
      return out
    }

    // ── משימות פתוחות ───────────────────────────────────────────────────────
    case 'get_pending_tasks': {
      const tasks: { אגף: string; משימה: string; כמות: number }[] = []

      if (canView(ctx, 'beneficiaries')) {
        const { count: p } = await db.from('beneficiaries')
          .select('*', { count: 'exact', head: true }).eq('eligibility_status', 'pending')
        if (p) tasks.push({ אגף: 'איגוד הצאצאים', משימה: 'רישומים ממתינים לאישור', כמות: p })

        const { count: d } = await db.from('beneficiaries')
          .select('*', { count: 'exact', head: true }).eq('eligibility_status', 'docs_pending')
        if (d) tasks.push({ אגף: 'איגוד הצאצאים', משימה: 'ממתינים להשלמת מסמכים', כמות: d })
      }

      for (const [key, cfg] of Object.entries(SECTION_TABLE)) {
        if (key === 'beneficiaries' || !canView(ctx, cfg.perm)) continue
        const { count } = await db.from(cfg.table)
          .select('*', { count: 'exact', head: true }).eq('status', 'pending')
        if (count) tasks.push({ אגף: cfg.label, משימה: 'בקשות ממתינות לאישור', כמות: count })
      }

      return tasks.length ? tasks : { message: 'אין כרגע משימות פתוחות.' }
    }

    // ── ספירת נרשמים ────────────────────────────────────────────────────────
    case 'count_registrations': {
      if (!canView(ctx, 'beneficiaries')) return deny('משפחות')
      const days = Number(input.days) || 1
      const { count } = await db.from('beneficiaries')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', sinceISO(days)!)
      return { ימים_אחורה: days, נרשמו: count ?? 0 }
    }

    // ── חיפוש משפחה ─────────────────────────────────────────────────────────
    case 'search_beneficiary': {
      if (!canView(ctx, 'beneficiaries')) return deny('משפחות')
      const q = String(input.query ?? '').trim()
      if (!q) return { error: 'לא צוין מה לחפש' }

      const digits = q.replace(/\D/g, '')
      const filter = digits.length >= 5
        ? `id_number.eq.${digits},spouse_id_number.eq.${digits}`
        : `family_name.ilike.%${q}%,full_name.ilike.%${q}%,spouse_name.ilike.%${q}%`

      const { data } = await db.from('beneficiaries')
        .select('id, family_name, full_name, spouse_name, id_number, phone, city, eligibility_status')
        .or(filter)
        .limit(10)

      if (!data?.length) return { message: `לא נמצאה משפחה עבור "${q}"` }
      return data
    }

    // ── רשימת בקשות ─────────────────────────────────────────────────────────
    case 'list_requests': {
      const cfg = SECTION_TABLE[String(input.section)]
      if (!cfg) return { error: 'אגף לא מוכר' }
      if (!canView(ctx, cfg.perm)) return deny(cfg.label)

      let q = db.from(cfg.table)
        .select('id, status, created_at, beneficiary:beneficiaries(family_name, full_name, id_number)')
        .order('created_at', { ascending: false })
        .limit(Math.min(Number(input.limit) || 20, 50))

      if (input.status) q = q.eq('status', String(input.status))

      const { data, error } = await q
      if (error) return { error: 'שגיאה בשליפת הנתונים' }
      return data?.length ? data : { message: 'לא נמצאו בקשות' }
    }

    // ── סטטיסטיקה ───────────────────────────────────────────────────────────
    case 'get_stats': {
      const cfg = SECTION_TABLE[String(input.section)]
      if (!cfg) return { error: 'אגף לא מוכר' }
      if (!canView(ctx, cfg.perm)) return deny(cfg.label)

      const since = sinceISO(Number(input.days))
      const statuses = ['pending', 'approved', 'rejected', 'active', 'completed']
      const out: Record<string, number> = {}

      for (const s of statuses) {
        let q = db.from(cfg.table).select('*', { count: 'exact', head: true }).eq('status', s)
        if (since) q = q.gte('created_at', since)
        const { count } = await q
        if (count) out[s] = count
      }

      let totalQ = db.from(cfg.table).select('*', { count: 'exact', head: true })
      if (since) totalQ = totalQ.gte('created_at', since)
      const { count: total } = await totalQ

      return { אגף: cfg.label, סהכ: total ?? 0, לפי_סטטוס: out }
    }

    default:
      return { error: `כלי לא מוכר: ${name}` }
  }
}
