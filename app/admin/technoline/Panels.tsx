'use client'
import { useState } from 'react'
import { EXTS, SYSTEM_LABELS, extId, type ExtInfo } from '@/lib/telephony/catalog'
import type { Msgs, SourceData } from './MessageList'

export type Sys = {
  id: 'main' | 'yerid' | 'distributors'; label: string; hasSecret: boolean; hasApiKey: boolean; hasNumber: boolean; missing: string[]
  callsReady: boolean; urls: { ext: string; label: string; digit: string; url: string }[]
}
export type Status = {
  systems: Sys[]
  account: { hasKey: boolean; monthlyCap: number; outboundEnabled: boolean; overview: { name: string; monthlyCap: number; monthSpent: number } | null; overviewError: string | null }
}
type Step = { ext: string; label: string; ok: boolean; error?: string }

const post = (body: unknown) => fetch('/api/admin/technoline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json().catch(() => ({})))
const Chip = ({ ok, text }: { ok: boolean; text: string }) => <span className={`chip ${ok ? 'ok' : 'bad'}`}>{text}</span>
const Todo = ({ t = '[להשלים]' }: { t?: string }) => <span className="todo">{t}</span>

// ===== חיבור ובנייה =====
export function HealthPanel({ st }: { st: Status }) {
  return (
    <div>
      <div className="grid3">{st.systems.map((s) => <SystemCard key={s.id} s={s} />)}</div>
      <UploadCard systems={st.systems} />
    </div>
  )
}

function SystemCard({ s }: { s: Sys }) {
  const [rootId, setRootId] = useState('')
  const [steps, setSteps] = useState<Step[] | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  async function build() {
    setBusy(true); setSteps(null); setMsg('')
    const j = await post({ action: 'tree', system: s.id, rootId })
    setBusy(false)
    if (j.steps) setSteps(j.steps); else setMsg(j.error ?? 'שגיאה')
  }
  return (
    <div className="card">
      <h2>{s.label}</h2>
      <p className="sub">{s.urls.length} שלוחות</p>
      <div className="check">
        <div><span>סוד נתיב</span><Chip ok={s.hasSecret} text={s.hasSecret ? 'קיים' : 'חסר'} /></div>
        <div><span>מפתח API</span><Chip ok={s.hasApiKey} text={s.hasApiKey ? 'קיים' : 'חסר'} /></div>
        <div><span>מספר טלפון</span><Chip ok={s.hasNumber} text={s.hasNumber ? 'קיים' : 'חסר'} /></div>
        <div><span>שיחות יוצאות</span><Chip ok={s.callsReady} text={s.callsReady ? 'מוכנות' : 'לא מוכנות'} /></div>
      </div>
      {s.missing.length > 0 && <p className="hint">חסר בשרת: <span className="ltr">{s.missing.join(', ')}</span></p>}
      <div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
        {s.urls.map((u) => <div key={u.ext}><small>{u.label}{u.digit && ` · מקש ${u.digit}`}</small><div className="url">{u.url}</div></div>)}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        <input className="search" dir="ltr" inputMode="numeric" placeholder="מזהה שלוחת אב בטכנוליין" value={rootId}
          onChange={(e) => setRootId(e.target.value.replace(/\D/g, ''))} />
        <button className="btn pri" disabled={busy || !rootId || !s.hasApiKey} onClick={build}>{busy ? 'בונה…' : 'בנה / עדכן שלוחות'}</button>
      </div>
      {msg && <p className="hint">{msg}</p>}
      {steps && <div className="check">{steps.map((x) => <div key={x.ext}><span>{x.label}</span><Chip ok={x.ok} text={x.ok ? 'עודכן' : x.error ?? 'שגיאה'} /></div>)}</div>}
    </div>
  )
}

function UploadCard({ systems }: { systems: Sys[] }) {
  const [sys, setSys] = useState(systems[0]?.id ?? 'main')
  const [extIdv, setExtIdv] = useState('')
  const [msg, setMsg] = useState('')
  async function upload(file: File) {
    setMsg('מעלה…')
    const f = new FormData()
    f.set('system', sys); f.set('extensionId', extIdv); f.set('name', file.name.replace(/\.[^.]+$/, '')); f.set('file', file)
    const j = await fetch('/api/admin/technoline', { method: 'POST', body: f }).then((r) => r.json().catch(() => ({})))
    setMsg(j.ok ? 'ההקלטה הועלתה' : j.error ?? 'שגיאה')
  }
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h2>העלאת הקלטה לשלוחה בטכנוליין</h2>
      <p className="sub">קובץ עד 2MB לשלוחה לפי המזהה שלה בטכנוליין.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="search" value={sys} onChange={(e) => setSys(e.target.value as Sys['id'])}>
          {systems.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <input className="search" dir="ltr" inputMode="numeric" placeholder="מזהה שלוחה" value={extIdv} onChange={(e) => setExtIdv(e.target.value.replace(/\D/g, ''))} />
        <label className="btn" style={extIdv ? undefined : { opacity: .4, pointerEvents: 'none' }}>בחר קובץ
          <input type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
        </label>
        {msg && <span className="chip mute">{msg}</span>}
      </div>
    </div>
  )
}

// ===== מספרים וחשבון =====
export function AccountPanel({ st }: { st: Status }) {
  const a = st.account
  const [form, setForm] = useState({ systemId: '', groupId: '', number: '', price: '' })
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  async function buy() {
    setBusy(true); setMsg('')
    const j = await post({ action: 'buy', ...form, price: Number(form.price) || 0 })
    setBusy(false); setMsg(j.ok ? 'המספר נרכש' : j.error ?? 'שגיאה')
  }
  return (
    <div>
      <div className="grid3" style={{ marginBottom: 16 }}>
        <div className="card"><div className="sub">הוצא החודש</div>
          <div className="bignum num">{a.overview ? `${a.overview.monthSpent} ₪` : <Todo t="[לא זמין]" />}</div>
          <p className="hint">{a.overviewError ?? 'נמשך מהחשבון בטכנוליין. יתרה בחשבון אינה מוחזרת על ידם [להשלים].'}</p></div>
        <div className="card"><div className="sub">תקרה חודשית</div>
          <div className="bignum num">{a.monthlyCap ? `${a.monthlyCap} ₪` : <Todo t="[לא הוגדרה]" />}</div>
          <p className="hint">מ-<span className="ltr">TECHNOLINE_MONTHLY_CAP</span>. מעבר לה לא נרכשים מספרים.</p></div>
        <div className="card"><div className="sub">שיחות יוצאות</div>
          <div className="bignum">{a.outboundEnabled ? 'פעילות' : 'כבויות'}</div>
          <p className="hint">קוד אימות בשיחה יוצאת. דורש בטכנוליין «חיוב לפי שימוש», אחרת השיחה נכשלת (שגיאה 7). {!a.hasKey && 'חסר מפתח חשבון (TECHNOLINE_ACCOUNT_KEY).'}</p></div>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>מספרים</h2><p className="sub">מספר אחד לכל מערכת. מערכת בלי מספר לא מקבלת שיחות.</p>
        <div className="check">
          {st.systems.map((s) => (
            <div key={s.id}><span><b>{s.label}</b></span><Chip ok={s.hasNumber} text={s.hasNumber ? 'מוגדר' : 'אין מספר'} /></div>
          ))}
        </div>
      </div>
      <div className="card">
        <h2>רכישת מספר</h2>
        <p className="sub">הרכישה נחסמת אם לא הוגדרה תקרה חודשית או שהיא מוצתה.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {([['systemId', 'מזהה מערכת'], ['groupId', 'מזהה קבוצה'], ['number', 'מספר'], ['price', 'מחיר (₪)']] as const).map(([k, ph]) => (
            <input key={k} className="search" dir="ltr" placeholder={ph} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
          ))}
          <button className="btn pri" disabled={busy || !form.number || !form.systemId || !form.groupId} onClick={buy}>{busy ? 'רוכש…' : 'רכוש מספר'}</button>
        </div>
        {msg && <p className="hint">{msg}</p>}
      </div>
    </div>
  )
}

// ===== יומן שיחות =====
export function LogPanel() {
  return (
    <div className="card">
      <h2>יומן שיחות</h2>
      <p className="sub">עדיין לא מחובר: המערכת לא שומרת שיחות, וטכנוליין לא הוכח שמחזירה יומן דרך ה-API <Todo />. בלי נתוני דוגמה, כדי שלא יתבלבלו עם שיחות אמיתיות.</p>
    </div>
  )
}

// ===== בדיקת שיחה: תצוגה מקדימה של מה שהמתקשר שומע =====
export function TestPanel({ sources, startId }: { sources: Record<string, SourceData | undefined>; startId?: string }) {
  const withMsgs = EXTS.filter((e) => e.source)
  const [id, setId] = useState(startId && withMsgs.some((e) => extId(e) === startId) ? startId : extId(withMsgs[0]))
  const e = withMsgs.find((x) => extId(x) === id) as ExtInfo
  const d = e.source ? sources[e.source] : undefined
  const lines = (d?.meta ?? []).map((m) => ({ label: m.label, text: (d?.messages[m.key]?.text ?? m.defaultText), rec: !!d?.messages[m.key]?.audio }))
  return (
    <div className="dial">
      <div className="phone">
        <div className="ph-h"><b>{SYSTEM_LABELS[e.sys]}</b><span>תצוגה מקדימה</span></div>
        <select className="search" style={{ maxWidth: 'none' }} value={id} onChange={(ev) => setId(ev.target.value)} aria-label="שלוחה">
          {withMsgs.map((x) => <option key={extId(x)} value={extId(x)}>{SYSTEM_LABELS[x.sys]} · {x.name}</option>)}
        </select>
        <div className="script">
          {lines.length === 0 && <div className="say">טוען…</div>}
          {lines.map((l, i) => <div className="say" key={i}><small>{l.label}{l.rec ? ' · הקלטה' : ''}</small>{l.text}</div>)}
        </div>
      </div>
      <div className="card">
        <h2>מה המתקשר שומע</h2>
        <p className="sub">כל הנוסחים של השלוחה בנוסח השמור כרגע. משתנים כמו <span className="ltr">{'{name}'}</span> מוחלפים בשיחה בנתונים האמיתיים.</p>
        <p className="hint">חיוג מדומה שמריץ את הקוד האמיתי של השיחה (בחירת מי מתקשר ומקשים) עוד לא נבנה <Todo />.</p>
      </div>
    </div>
  )
}

export type { Msgs }
