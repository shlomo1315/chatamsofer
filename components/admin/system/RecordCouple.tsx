'use client'
import { useState, type ReactNode } from 'react'
import { Check, Copy, Mail, Phone } from 'lucide-react'
import s from './RecordCouple.module.css'

// כרטסת זוג: כרטיס נפרד לבעל ולאישה, מגורים, ומייל שנפתח בחלונית שליחה.
// העיצוב מועתק מהמוקאפ המאושר (דוגמה "מולר"), ראו RecordCouple.module.css.

export interface CouplePerson { role: string; name?: string | null; idNumber?: string | null; phone?: string | null; email?: string | null }

export interface CoupleData {
  him: CouplePerson
  her: CouplePerson
  /** מצב משפחתי; ריק = תגית "לא הוזן" */
  status?: string | null
  kids: number
  city?: string | null
  address?: string | null
  onEmail: (email: string) => void
}

const fmtPhone = (t: string) => (/^\d{10}$/.test(t) ? `${t.slice(0, 3)}-${t.slice(3, 6)}-${t.slice(6)}` : t)
const Miss = () => <span className={s.miss}>— לא הוזן</span>

function Row({ label, children }: { label: string; children?: ReactNode }) {
  return <div className={s.fr}><dt>{label}</dt><dd>{children || <Miss />}</dd></div>
}

function CopyId({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button type="button" className={s.cp} title="העתקה" aria-label="העתקת ת״ז"
      onClick={() => { navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) }}>
      {done ? <Check size={16} /> : <Copy size={16} />}
    </button>
  )
}

function Person({ p, onEmail }: { p: CouplePerson; onEmail: (e: string) => void }) {
  return (
    <div className={s.pc}>
      <header><i>{p.role}</i>{p.name ? <b>{p.name}</b> : <b className={s.none}>— שם לא הוזן</b>}</header>
      <dl>
        <Row label="ת״ז">{p.idNumber && <><span className={s.ltr}>{p.idNumber}</span><CopyId text={p.idNumber} /></>}</Row>
        <Row label="טלפון">{p.phone && <a className={s.tel} href={`tel:${p.phone}`}><Phone size={16} /><span className={s.ltr}>{fmtPhone(p.phone)}</span></a>}</Row>
        <Row label="מייל">{p.email && <button type="button" className={s.mail} title={p.email} onClick={() => onEmail(p.email!)}><Mail size={18} /><span>{p.email}</span></button>}</Row>
      </dl>
    </div>
  )
}

export function CoupleSection({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return <section className={s.sec}><h3><em>{n}</em>{title}</h3>{children}</section>
}

export function CoupleFamily({ d }: { d: CoupleData }) {
  return (
    <>
      <div className={s.hh}>
        {d.status ? <span className={`${s.tag} ${s.g}`}>{d.status}</span> : <span className={`${s.tag} ${s.w}`}>מצב משפחתי לא הוזן</span>}
        <span className={s.tag}><b>{d.kids}</b> ילדים</span>
      </div>
      <div className={s.couple}>
        <Person p={d.him} onEmail={d.onEmail} />
        <Person p={d.her} onEmail={d.onEmail} />
      </div>
      <div className={s.home}>
        <i>מגורים</i>
        <Row label="עיר">{d.city}</Row>
        <Row label="כתובת">{d.address}</Row>
      </div>
    </>
  )
}

export interface CoupleFact { label: string; value: string; sub?: string }

export function CoupleCard({ title, idNumber, statusLabel, statusColor, steps, facts, nav, sections }: {
  title: string
  idNumber?: string | null
  statusLabel: string
  statusColor: string
  steps: { labels: string[]; current: number }
  facts: CoupleFact[]
  nav: ReactNode
  sections: { title: string; content: ReactNode }[]
}) {
  return (
    <div className={s.card}>
      <div className={s.top}>
        {nav}
        <div className={s.row}>
          <div className={s.av}>{title.charAt(0)}</div>
          <div><h1>{title}</h1><small>ת״ז <span className={s.ltr}>{idNumber || '—'}</span></small></div>
          <div className={s.stamp} style={{ ['--st' as string]: statusColor }}>{statusLabel}</div>
        </div>
        <ol className={s.steps}>
          {steps.labels.map((l, i) => <li key={l} className={i === steps.current ? s.cur : i > steps.current ? s.fut : ''}>{l}</li>)}
        </ol>
      </div>
      <div className={s.facts}>
        {facts.map((f) => <div key={f.label}><small>{f.label}</small><b>{f.value}</b>{f.sub && <em>{f.sub}</em>}</div>)}
      </div>
      <div className={s.body}>
        {sections.map((sec, i) => <CoupleSection key={sec.title} n={i + 1} title={sec.title}>{sec.content}</CoupleSection>)}
      </div>
    </div>
  )
}
