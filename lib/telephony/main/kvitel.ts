// שלוחת הקוויטלאך בטכנוליין (מערכת ראשית). המתקשר מזוהה לפי הטלפון:
// יש שמות שמורים: 1 לשליחתם, 2 להקלטה חדשה. אין שמות: ישר להקלטה, שנכנסת ל"לבדיקה".
import { getServiceClient } from '@/lib/apiAuth'
import { normalizePhone, formatLine, type KvitelLineInput } from '@/lib/kvitel'
import { ingestKvitel } from '@/lib/kvitelIngest'
import { KV_CONFIRM, KV_REC, MAX_SPOKEN } from '@/lib/kvitelPhone'
import { goodbye, menu, say } from '../modules'
import type { TlHandler, TlParams, TlResult } from '../types'

export type KvitelTurn = { result: TlResult; action: { kind: 'saved' } | { kind: 'recording'; path: string } | null }
const done = (result: TlResult, action: KvitelTurn['action'] = null): KvitelTurn => ({ result, action })

const recordPrompt = 'נא אמרו אחרי הצליל את השמות. לכל שם: השם, בן או בת, שם האם, והבקשה. בסיום הקישו סולמית'
const record = (lead: string[]): TlResult => ({
  type: 'record', name: KV_REC, max: 120, min: 2, confirm: 'confirmOnly', maskLog: true, files: say(...lead, recordPrompt),
})

/** לוגיקה טהורה: מה לומר ומה לשמור, לפי הפרמטרים והשמות השמורים. */
export function kvitelTurn(p: TlParams, saved: KvitelLineInput[]): KvitelTurn {
  const rec = (p[`PATH_${KV_REC}`] ?? p[KV_REC] ?? '').trim()
  if (rec) return done(goodbye('השמות נקלטו ויוזכרו בתפילה על הציון הקדוש. תודה ושלום'), { kind: 'recording', path: rec })

  const confirm = p[KV_CONFIRM] ?? ''
  if (confirm === '1' && saved.length) {
    return done(goodbye('השמות נשלחו ויוזכרו בתפילה על הציון הקדוש. תודה ושלום'), { kind: 'saved' })
  }
  if (confirm === '2' || !saved.length) return done(record(confirm === '2' ? [] : ['שלום, כאן קוויטלאך היכל החתם סופר']))

  return done(menu(KV_CONFIRM, ['1', '2'], say(
    'שלום, כאן קוויטלאך היכל החתם סופר. השמות ששלחתם בפעם הקודמת',
    ...saved.slice(0, MAX_SPOKEN).map(formatLine),
    'לשליחת השמות האלה הקישו 1. להקלטת שמות חדשים הקישו 2',
  )))
}

export const kvitel: TlHandler = async ({ phone: raw, callId, params }) => {
  const db = getServiceClient()
  if (!db) return goodbye('שגיאת שרת')
  const phone = normalizePhone(raw)
  let saved: KvitelLineInput[] = []
  if (phone) {
    const { data: requester } = await db.from('kvitel_requesters').select('id').eq('phone', phone).maybeSingle()
    if (requester) {
      const { data } = await db.from('kvitel_saved_names')
        .select('name, relation, parent_name, request_type, request_note')
        .eq('requester_id', requester.id).order('last_used_at', { ascending: false }).limit(MAX_SPOKEN)
      saved = (data ?? []).map((r) => ({
        name: r.name, relation: r.relation, parentName: r.parent_name, requestType: r.request_type, requestNote: r.request_note,
      }))
    }
  }
  const turn = kvitelTurn(params, saved)
  const sourceRef = callId || null
  if (turn.action?.kind === 'saved') {
    const res = await ingestKvitel(db, { channel: 'phone', phone, lines: saved, sourceRef, note: 'אושרו בטלפון השמות השמורים' })
    if (!res.ok) console.error('[telephony:main/kvitel] שמירה נכשלה:', res.error)
  } else if (turn.action?.kind === 'recording') {
    const res = await ingestKvitel(db, {
      channel: 'phone', status: 'review', phone, lines: [], sourceRef,
      recordingUrl: `technoline:${turn.action.path}`, note: 'הוקלט בטלפון (טכנוליין), בלי תמלול',
    })
    if (!res.ok) console.error('[telephony:main/kvitel] שמירה נכשלה:', res.error)
  }
  return turn.result
}
