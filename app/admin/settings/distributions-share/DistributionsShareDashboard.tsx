'use client'

// מסך שיתוף חלוקות החגים: סטטוס, קישור, סיסמה, מחוברים והגנה מניחוש.
// בנוי לפי כיוון ג׳ · לוח בקרה במוקאפ המאושר. העיצוב ב-DistributionsShare.module.css.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { Copy, ExternalLink, Eye, RotateCw, Lock, Monitor, Smartphone, MessageCircle } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { describeUserAgent, describeLastSeen, shortDate } from '@/lib/portalSessionDisplay'
import s from './DistributionsShare.module.css'

interface Session {
  id: string
  createdAt: string
  lastSeenAt: string | null
  expiresAt: string
  userAgent: string | null
  ip: string | null
}

const SHARE_PATH = '/shared/distributions'
const WORDS = ['', 'חלשה', 'סבירה', 'טובה', 'חזקה']
const GEN_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

const noSubscribe = () => () => {}

function score(v: string): number {
  if (!v) return 0
  let n = 0
  if (v.length >= 8) n++
  if (v.length >= 12) n++
  if (/[A-Z]/.test(v) && /[a-z]/.test(v)) n++
  if (/\d/.test(v) && /[^A-Za-z0-9]/.test(v)) n++
  return Math.max(1, n)
}

function generatePassword(): string {
  const a = new Uint32Array(14)
  crypto.getRandomValues(a)
  let p = ''
  for (let i = 0; i < 14; i++) {
    p += GEN_CHARS[a[i] % GEN_CHARS.length]
    if (i === 4 || i === 9) p += '-'
  }
  return p
}

export default function DistributionsShareDashboard() {
  const toast = useToast()
  const [hasPassword, setHasPassword] = useState<boolean | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => 'https://chasamsofer.co.il')
  const [pw, setPw] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [holidaysOnly, setHolidaysOnly] = useState<boolean | null>(null)
  const [scopeSaving, setScopeSaving] = useState(false)

  const loadSessions = useCallback(async () => {
    const r = await fetch('/api/admin/distributions-share/sessions')
    if (r.ok) setSessions((await r.json()).sessions ?? [])
  }, [])

  useEffect(() => {
    fetch('/api/admin/distributions-share/password')
      .then(r => r.json())
      .then(d => setHasPassword(!!d.hasPassword))
      .catch(() => setHasPassword(false))
    fetch('/api/admin/distributions-share/sessions')
      .then(r => (r.ok ? r.json() : { sessions: [] }))
      .then(d => setSessions(d.sessions ?? []))
      .catch(() => {})
    fetch('/api/admin/distributions-share/scope')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setHolidaysOnly(d.holidaysOnly !== false) })
      .catch(() => {})
  }, [])

  const url = origin + SHARE_PATH
  const host = origin.replace(/^https?:\/\//, '')
  const set = hasPassword === true
  const n = sessions.length
  const level = score(pw)
  const pwError = pw && pw.length < 8 ? 'הסיסמה חייבת להכיל לפחות 8 תווים' : ''

  function copy() {
    navigator.clipboard?.writeText(url).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  async function saveScope(on: boolean) {
    setScopeSaving(true)
    try {
      const r = await fetch('/api/admin/distributions-share/scope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holidaysOnly: on }),
      })
      const d = await r.json()
      if (!r.ok) { toast.error(d.error || 'שגיאה בשמירה'); return }
      setHolidaysOnly(on)
      toast.success(on ? 'הקישור מציג עכשיו רק חלוקות חגים' : 'הקישור מציג עכשיו את כל המחלקות')
    } catch {
      toast.error('שגיאה בשמירה')
    } finally {
      setScopeSaving(false)
    }
  }

  async function save() {
    if (pw.length < 8) { toast.error('הסיסמה חייבת להכיל לפחות 8 תווים'); return }
    setSaving(true)
    try {
      const r = await fetch('/api/admin/distributions-share/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      })
      const d = await r.json()
      if (!r.ok) { toast.error(d.error || 'שגיאה בשמירה'); return }
      toast.success(set
        ? (d.revoked ? `הסיסמה הוחלפה, ${d.revoked === 1 ? 'מחובר אחד נותק' : `${d.revoked} מחוברים נותקו`}` : 'הסיסמה הוחלפה')
        : 'הסיסמה נשמרה, והקישור פתוח')
      setHasPassword(true)
      setPw('')
      setShowPw(false)
      await loadSessions()
    } catch {
      toast.error('שגיאה בשמירה')
    } finally {
      setSaving(false)
    }
  }

  async function revoke(id?: string) {
    setBusy(id ?? 'all')
    try {
      const r = await fetch('/api/admin/distributions-share/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(id ? { id } : {}),
      })
      const d = await r.json()
      if (!r.ok) { toast.error(d.error || 'הניתוק נכשל'); return }
      toast.success(id ? 'החיבור נותק' : 'כל המחוברים נותקו')
      await loadSessions()
    } catch {
      toast.error('הניתוק נכשל')
    } finally {
      setBusy(null)
    }
  }

  const connected = n === 1 ? 'מחובר אחד' : `${n} מחוברים`
  const saveLabel = !set ? 'שמור ופתח את הקישור' : n > 0 ? `החלף ונתק ${n}` : 'החלף סיסמה'

  return (
    <div className={`${s.root} ${hasPassword === false ? s.unset : ''}`}>
      <div className={s.crumbs}><Link href="/admin/settings">הגדרות</Link> › <b>שיתוף חלוקות חגים</b></div>
      <header className={s.head}>
        <div>
          <h1>שיתוף חלוקות החגים</h1>
          <p>תצוגה בלבד, מוגנת בסיסמה. מה פתוח, מי מחובר, ומה קורה כשמנחשים.</p>
        </div>
        {set && (
          <a className={s.btn} href={SHARE_PATH} target="_blank" rel="noopener noreferrer">
            <ExternalLink />פתח את הדף כמו ההנהלה
          </a>
        )}
      </header>

      <div className={s.bento}>
        <div className={`${s.tile} ${s.tStatus}`}>
          <div className={s.k}><span>מצב</span><Lock width={14} height={14} /></div>
          {hasPassword === null ? (
            <div className={s.big}>…</div>
          ) : set ? (
            <>
              <div className={s.big}>פתוח<em>.</em></div>
              <p>מוגן בסיסמה. {n === 0 ? 'אין מחוברים.' : `${connected}.`}</p>
            </>
          ) : (
            <>
              <div className={s.big}>סגור</div>
              <p>אין סיסמה, ולכן הקישור לא נפתח לאף אחד.</p>
            </>
          )}
          {holidaysOnly !== null && (
            <label className={s.row} style={{ gap: 8, alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={holidaysOnly}
                disabled={scopeSaving}
                onChange={e => void saveScope(e.target.checked)}
              />
              <span>חלוקות חגים בלבד (עזר יולדות וצאצאים מוסתרים)</span>
            </label>
          )}
        </div>

        <div className={`${s.tile} ${s.tLink}`}>
          <div className={s.k}><span>הקישור</span></div>
          <div className={`${s.u} ${s.ltr}`}>{host}<span>/shared/</span><wbr />distributions</div>
          <div className={s.row}>
            <button type="button" className={`${s.btn} ${s.pri} ${copied ? s.copied : ''}`} onClick={copy}>
              <Copy /><span>{copied ? 'הועתק' : 'העתק קישור'}</span>
            </button>
            <a className={s.btn} href={`https://wa.me/?text=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer">
              <MessageCircle />שלח בוואטסאפ
            </a>
          </div>
        </div>

        <form className={`${s.tile} ${s.tPw}`} onSubmit={e => { e.preventDefault(); save() }}>
          <div className={s.k}><span>{set ? 'החלפת סיסמה' : 'הגדרת סיסמה'}</span></div>
          <div className={s.field}>
            <label htmlFor="share-pw" className={s.srOnly}>סיסמה</label>
            <div className={s.inp}>
              <input
                id="share-pw"
                type={showPw ? 'text' : 'password'}
                placeholder="לפחות 8 תווים"
                dir="ltr"
                autoComplete="new-password"
                value={pw}
                onChange={e => setPw(e.target.value)}
              />
              <div className={s.tools}>
                <button type="button" className={s.iconBtn} title="הצג" aria-label="הצג סיסמה" onClick={() => setShowPw(v => !v)}><Eye /></button>
                <button type="button" className={s.iconBtn} title="צור סיסמה חזקה" aria-label="צור סיסמה חזקה" onClick={() => { setPw(generatePassword()); setShowPw(true) }}><RotateCw /></button>
              </div>
            </div>
            <div className={s.meter} data-l={level}><i /><i /><i /><i /></div>
            <div className={s.hint}>
              <span>{pw ? <><b>{WORDS[level]}</b> · {pw.length} תווים</> : '8 תווים לפחות'}</span>
            </div>
            {pwError && <div className={s.err}>{pwError}</div>}
          </div>
          {set && pw && n > 0 && (
            <div className={s.confirm}>שמירה תנתק את <b>{n === 1 ? 'המחובר היחיד' : `${n} המחוברים`}</b>.</div>
          )}
          <button type="submit" className={`${s.btn} ${s.pri}`} disabled={saving}>
            {saving ? 'שומר…' : saveLabel}
          </button>
        </form>

        <div className={`${s.tile} ${s.tSess}`}>
          <div className={s.k}>
            <span>מחוברים</span>
            {n > 0 && (
              <button type="button" className={`${s.btn} ${s.danger} ${s.sm}`} disabled={busy !== null} onClick={() => revoke()}>
                נתק את כולם
              </button>
            )}
          </div>
          {n > 0 ? (
            <table className={s.sess}>
              <tbody>
                {sessions.map(x => {
                  const dev = describeUserAgent(x.userAgent)
                  const seen = describeLastSeen(x.lastSeenAt ?? x.createdAt)
                  return (
                    <tr key={x.id}>
                      <td>
                        <div className={s.dev}>
                          <span className={s.ic}>{dev.mobile ? <Smartphone /> : <Monitor />}</span>
                          <div>{dev.label}<small>נכנס {shortDate(x.createdAt)}</small></div>
                        </div>
                      </td>
                      <td className={`${s.ltr} ${s.num}`}>{x.ip ?? '—'}</td>
                      <td>{seen.live ? <span className={s.live}>{seen.text}</span> : seen.text}</td>
                      <td>
                        <button type="button" className={`${s.btn} ${s.danger} ${s.sm}`} disabled={busy !== null} onClick={() => revoke(x.id)}>
                          נתק
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <div className={s.empty}>עוד אף אחד לא נכנס.</div>
          )}
        </div>

        <div className={`${s.tile} ${s.tSec}`}>
          <div><div className={s.k}>ניסיונות עד חסימה</div><div className={`${s.v} ${s.num}`}>3</div><div className={s.d}>לכל כתובת IP</div></div>
          <div><div className={s.k}>חסימה ראשונה</div><div className={`${s.v} ${s.num}`}>3 <small>שעות</small></div><div className={s.ladder}><i className={s.b1} /><i className={s.b1} /><i /><i /></div></div>
          <div><div className={s.k}>חסימה שנייה</div><div className={`${s.v} ${s.num}`}>24 <small>שעות</small></div><div className={s.ladder}><i className={s.b2} /><i className={s.b2} /><i className={s.b2} /><i className={s.b2} /></div></div>
          <div><div className={s.k}>משך כניסה</div><div className={`${s.v} ${s.num}`}>30 <small>יום</small></div><div className={s.d}>באותו מכשיר</div></div>
        </div>
      </div>
    </div>
  )
}
