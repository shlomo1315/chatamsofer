'use client'
import { useState } from 'react'

// הודעה יוצאת לרשימת התפוצה של חנוכה: הכנת הרשימה, שיחת ניסיון ושליחה באישור מפורש.
type List = { id: string; name: string; phonesCount: number; blocked: number; created: boolean }

const post = (body: unknown) => fetch('/api/admin/technoline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json().catch(() => ({})))

export default function CampaignPanel() {
  const [list, setList] = useState<List | null>(null)
  const [text, setText] = useState('')
  const [phone, setPhone] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')

  async function run(kind: string, body: Record<string, unknown>, done: (j: Record<string, unknown>) => string) {
    setBusy(kind); setMsg('')
    const j = await post(body)
    setBusy('')
    setMsg(j.ok ? done(j) : String(j.error ?? 'שגיאה'))
    return j
  }

  async function prepare() {
    await run('list', { action: 'campaign-list' }, (j) => {
      setList(j.list as List); setText(String(j.message ?? ''))
      return (j.list as List).created ? 'הרשימה נוצרה בטכנוליין' : 'הרשימה קיימת בטכנוליין'
    })
  }

  async function send() {
    if (!list) return
    const active = list.phonesCount - list.blocked
    if (!window.confirm(`לשלוח את ההודעה עכשיו ל-${active} מספרים ברשימה "${list.name}"? אי אפשר לבטל אחרי השליחה.`)) return
    await run('send', { action: 'campaign-send', confirm: list.name }, () => 'השליחה יצאה. הדוח בטכנוליין')
  }

  return (
    <div className="card">
      <h2>רשימת תפוצה לחנוכה</h2>
      <p className="sub">הקשה 1 מעבירה ישר לרישום בשלוחת החגים. הקשה 2 מסירה את המספר מהרשימה הזו בלבד. את המספרים מוסיפים לרשימה בממשק של טכנוליין.</p>
      <button className="btn" disabled={!!busy} onClick={prepare}>{busy === 'list' ? 'בודק…' : list ? 'רענון הרשימה' : 'הכנת הרשימה והצגת הנוסח'}</button>

      {list && (
        <>
          <div className="check" style={{ margin: '16px 0' }}>
            <div><span>שם הרשימה</span><b>{list.name}</b></div>
            <div><span>מספרים ברשימה</span><b className="num">{list.phonesCount}</b></div>
            <div><span>הוסרו (הקישו 2)</span><b className="num">{list.blocked}</b></div>
          </div>
          <p className="hint" style={{ lineHeight: 1.8 }}>{text}</p>

          <h2 style={{ marginTop: 16 }}>שיחת ניסיון</h2>
          <p className="sub">קודם לבדוק במספר שלך: לשמוע את ההודעה, להקיש 1 ולוודא שהרישום עונה.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className="search" dir="ltr" inputMode="tel" placeholder="05XXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <button className="btn" disabled={!!busy || !phone} onClick={() => run('test', { action: 'campaign-test', phone }, () => 'שיחת הניסיון יצאה')}>{busy === 'test' ? 'מחייג…' : 'שיחת ניסיון'}</button>
          </div>

          <h2 style={{ marginTop: 16 }}>שליחה לכל הרשימה</h2>
          <button className="btn pri" disabled={!!busy || list.phonesCount - list.blocked < 1} onClick={send}>{busy === 'send' ? 'שולח…' : 'שליחה לרשימה'}</button>
        </>
      )}
      {msg && <p className="hint" role="status">{msg}</p>}
    </div>
  )
}
