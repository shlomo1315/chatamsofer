'use client'
import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
  Users, Landmark, Baby, UtensilsCrossed, Gift, HandCoins, Download, CheckCircle2, ChevronLeft,
} from 'lucide-react'
import PendingTasksPanel from './PendingTasksPanel'
import { Donut, Ring, Columns, HBar, AreaChart, C } from './DashboardCharts'
import './dashboard.css'

export interface DashStats {
  totalBeneficiaries: number; newBeneficiariesWeek: number; approved: number; pending: number; deepReview: number
  activeLoans: number; pendingLoans: number; loansApprovedTotal: number; loansDisbursed: number; disbursedAmount: number
  legacyCount: number; legacyTakenCount: number
  maternityActive: number; maternityPending: number; maternityDeepReview: number
  cardsPending: number; cardsRemaining: number
  distributionsPlanned: number
  holidayName: string | null; holidayRegistered: number; holidayExpected: number; holidayOpen: boolean
  aidPending: number; aidAwaiting: number; aidApproved: number
}

export interface DashViewProps {
  greeting: string
  s: DashStats
  pendingTotal: number
  purchased: number
  delivered: number | null
  can: { beneficiaries: boolean; loans: boolean; maternity: boolean; cards: boolean; aid: boolean; distributions: boolean; reports: boolean }
  devMode: boolean
}

type TabId = 'ov' | 'de' | 'lo' | 'ma' | 'fo' | 'me' | 'ho'

const fmt = (n: number) => n.toLocaleString('he-IL')
const usd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
const ils = (n: number) => `${n.toLocaleString('he-IL', { maximumFractionDigits: 0 })} ₪`
const pctOf = (v: number, t: number) => (t > 0 ? (v / t) * 100 : 0)

// המחשה בלבד: יוחלף בנתוני נרשמים לפי חודש מהמסד
const DEMO_MONTHS = ['תשרי', 'חשון', 'כסלו', 'טבת', 'שבט', 'אדר', 'ניסן', 'אייר', 'סיון', 'תמוז', 'אב', 'אלול']
const DEMO_VALUES = [2, 5, 4, 7, 6, 9, 8, 11, 10, 13, 12, 15]

type Tone = 'bad' | 'warn' | 'blue'
const toneStyle: Record<Tone, { background: string; color: string }> = {
  bad: { background: 'var(--bad-soft)', color: 'var(--bad)' },
  warn: { background: 'var(--warn-soft)', color: 'var(--warn)' },
  blue: { background: 'var(--blue-soft)', color: 'var(--blue)' },
}
const toneRank: Record<Tone, number> = { bad: 0, warn: 1, blue: 2 }

function DeptHead({ icon, title, sub, href, cta = 'כניסה לאגף' }: { icon: ReactNode; title: string; sub: string; href: string; cta?: string }) {
  return (
    <div className="dhead">
      <span className="ic">{icon}</span>
      <div><h2>{title}</h2><p>{sub}</p></div>
      <Link href={href} className="btn">{cta}</Link>
    </div>
  )
}

function Mini({ items }: { items: { l: string; v: string; color?: string; num?: boolean }[] }) {
  return (
    <div className="mini">
      {items.map(i => (
        <div key={i.l}>
          <div className="l">{i.l}</div>
          <div className={`v${i.num === false ? '' : ' num'}`} style={i.color ? { color: i.color } : undefined}>{i.v}</div>
        </div>
      ))}
    </div>
  )
}

export default function DashboardView({ greeting, s, pendingTotal, purchased, delivered, can, devMode }: DashViewProps) {
  const [tab, setTab] = useState<TabId>('ov')

  // ── תור העבודה: לפי דחיפות, רק מה שפתוח ובהרשאה ──
  const queue: { n: number; title: string; dept: string; tone: Tone; tab: TabId }[] = []
  if (can.beneficiaries) {
    queue.push({ n: s.deepReview, title: 'בדיקה מעמיקה', dept: 'איגוד הצאצאים', tone: 'bad', tab: 'de' })
    queue.push({ n: s.newBeneficiariesWeek, title: 'נרשמים חדשים', dept: 'השבוע', tone: 'blue', tab: 'de' })
  }
  if (can.loans) queue.push({ n: s.pendingLoans, title: 'הלוואות לאישור', dept: 'גמ״ח הלוואות', tone: 'warn', tab: 'lo' })
  if (can.maternity) {
    queue.push({ n: s.maternityPending, title: 'יולדות לאישור', dept: 'עזר יולדות', tone: 'warn', tab: 'ma' })
    queue.push({ n: s.maternityDeepReview, title: 'יולדות בבדיקה מעמיקה', dept: 'עזר יולדות', tone: 'bad', tab: 'ma' })
  }
  if (can.cards) queue.push({ n: s.cardsPending, title: 'ממתינות לכרטיס מזון', dept: 'כרטיסי מזון', tone: 'warn', tab: 'fo' })
  if (can.aid) queue.push({ n: s.aidPending + s.aidAwaiting, title: 'בקשות סיוע', dept: 'סיוע רפואי', tone: 'warn', tab: 'me' })
  const open = queue.filter(q => q.n > 0).sort((a, b) => toneRank[a.tone] - toneRank[b.tone] || b.n - a.n)
  const doneDepts: string[] = []
  if (can.aid && s.aidPending + s.aidAwaiting === 0) doneDepts.push('סיוע רפואי')
  if (can.loans && s.pendingLoans === 0) doneDepts.push('הלוואות')
  if (can.maternity && s.maternityPending + s.maternityDeepReview === 0) doneDepts.push('יולדות')

  const top = open[0]
  const subLine = top
    ? <><b className="num">{fmt(pendingTotal)}</b> פניות ממתינות לטיפול. הכי דחוף: <b className="num">{fmt(top.n)}</b> {top.title} ({top.dept}).</>
    : <>אין כרגע פניות ממתינות לטיפול.</>

  const tabs: { id: TabId; label: string; show: boolean; badge?: { n: number; tone: 'w' | 'b' } }[] = [
    { id: 'ov', label: 'סקירה כללית', show: true },
    { id: 'de', label: 'איגוד הצאצאים', show: can.beneficiaries, badge: s.deepReview ? { n: s.deepReview, tone: 'b' } : undefined },
    { id: 'lo', label: 'גמ״ח הלוואות', show: can.loans, badge: s.pendingLoans ? { n: s.pendingLoans, tone: 'w' } : undefined },
    { id: 'ma', label: 'עזר יולדות', show: can.maternity, badge: s.maternityPending ? { n: s.maternityPending, tone: 'w' } : undefined },
    { id: 'fo', label: 'כרטיסי מזון', show: can.cards },
    { id: 'me', label: 'סיוע רפואי', show: can.aid },
    { id: 'ho', label: 'חלוקות חגים', show: can.distributions },
  ]
  const visibleTabs = tabs.filter(t => t.show)
  const current = visibleTabs.find(t => t.id === tab) ?? visibleTabs[0]
  const go = (id: TabId) => { setTab(id); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  const regTotal = s.approved + s.pending + s.deepReview
  const regParts = [
    { value: s.pending, color: C.navy }, { value: s.deepReview, color: C.bad }, { value: s.approved, color: C.gold },
  ]
  const regLegend = [
    { name: 'ממתינים לאישור', v: s.pending, c: C.navy }, { name: 'בדיקה מעמיקה', v: s.deepReview, c: C.bad }, { name: 'מאושרים', v: s.approved, c: C.gold },
  ]
  const stockTotal = purchased
  const cols = [
    can.beneficiaries && { name: 'צאצאים', value: s.deepReview, color: C.navy },
    can.loans && { name: 'הלוואות', value: s.pendingLoans, color: C.warn },
    can.maternity && { name: 'יולדות', value: s.maternityPending + s.maternityDeepReview, color: C.gold },
    can.aid && { name: 'סיוע רפואי', value: s.aidPending + s.aidAwaiting, color: C.mute },
  ].filter(Boolean) as { name: string; value: number; color: string }[]

  const ovCards: ReactNode[] = []
  if (cols.length) ovCards.push(
    <div key="cols" className="card s4">
      <div className="ch"><h3>ממתינים לטיפול, לפי אגף</h3><span className="hint">כמה עבודה פתוחה בכל מקום</span></div>
      <div className="body"><Columns data={cols} /></div>
    </div>)
  if (can.cards && stockTotal > 0) ovCards.push(
    <div key="food" className="card s2">
      <div className="ch"><h3>כרטיסי מזון</h3></div>
      <div className="body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <Ring value={delivered ?? 0} total={stockTotal} label="נמסרו מתוך" />
        <div className="legend" style={{ width: '100%' }}>
          <div><i style={{ background: C.gold }} />נמסרו<b className="num">{fmt(delivered ?? 0)}</b></div>
          <div><i style={{ background: C.track }} />במלאי<b className="num">{fmt(s.cardsRemaining)}</b></div>
        </div>
      </div>
    </div>)
  if (can.beneficiaries) ovCards.push(
    <div key="reg" className="card s3">
      <div className="ch"><h3>מצב רישום הצאצאים</h3><a href="#" onClick={e => { e.preventDefault(); go('de') }}>לפרטים ‹</a></div>
      <div className="body donut">
        <Donut parts={regParts} total={regTotal} label="רשומות" />
        <div className="legend">
          {regLegend.map(l => (
            <div key={l.name}><i style={{ background: l.c }} />{l.name}<small className="num">{regTotal ? `${((l.v / regTotal) * 100).toFixed(l.v / regTotal < 0.1 ? 1 : 0)}%` : '0%'}</small><b className="num">{fmt(l.v)}</b></div>
          ))}
        </div>
      </div>
    </div>)
  if (can.loans) ovCards.push(
    <div key="loan" className="card s3">
      <div className="ch"><h3>מסלול ההלוואה</h3><a href="#" onClick={e => { e.preventDefault(); go('lo') }}>לפרטים ‹</a></div>
      <div className="body hb">
        <HBar label="אושרו" value={fmt(s.loansApprovedTotal)} pct={100} color={C.navy} />
        <HBar label="קיבלו שטר" value={fmt(s.loansDisbursed)} pct={pctOf(s.loansDisbursed, s.loansApprovedTotal)} color={C.navy2} />
        <HBar label="הלוואות פעילות" value={fmt(s.activeLoans)} pct={pctOf(s.activeLoans, s.loansApprovedTotal)} color={C.gold} />
        <HBar label="ממתינות לאישור" value={fmt(s.pendingLoans)} pct={pctOf(s.pendingLoans, s.loansApprovedTotal)} color={C.warn} />
      </div>
    </div>)
  if (can.beneficiaries) ovCards.push(
    <div key="area" className="card s6">
      <div className="ch"><h3>נרשמים חדשים לפי חודש</h3><span className="tag">המחשה: יחובר לנתונים מהמסד</span></div>
      <div className="body"><AreaChart labels={DEMO_MONTHS} values={DEMO_VALUES} /></div>
    </div>)

  const kpiSeg = [
    can.beneficiaries && s.deepReview, can.loans && s.pendingLoans, can.maternity && s.maternityPending,
  ].map(v => Number(v) || 0)

  return (
    <div className="db pb-10">
      <nav className="crumb" aria-label="איפה אני">
        <span>ראשי</span><span className="sep">‹</span>
        <b>לוח בקרה</b><span className="sep">‹</span>
        <span className="now" aria-current="page">{current.label}</span>
      </nav>

      <div className="head">
        <div><h1>{greeting}</h1><div className="sub">{subLine}</div></div>
        {can.reports && (
          <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 8 }}>
            <Link href="/admin/reports" className="btn ghost"><Download />הורדת דוח</Link>
          </div>
        )}
      </div>

      {devMode && <div className="warnbox"><b>מצב פיתוח:</b> Supabase לא מוגדר, מוצגים נתוני אפס.</div>}

      <div className="kpis">
        <PendingTasksPanel count={pendingTotal} segments={kpiSeg} />
        {can.beneficiaries && (
          <Link href="/admin/beneficiaries" className="card kpi">
            <div className="l"><Users />משפחות רשומות</div>
            <div className="v num">{fmt(s.totalBeneficiaries)}</div>
            <div className="f"><span style={{ color: 'var(--ok)', fontWeight: 700 }}>+{fmt(s.newBeneficiariesWeek)}</span> נרשמו השבוע</div>
          </Link>
        )}
        {can.loans && (
          <Link href="/admin/loans" className="card kpi">
            <div className="l"><Landmark />הלוואות בפועל</div>
            <div className="v num">{usd(s.disbursedAmount)}</div>
            <div className="f num">{fmt(s.activeLoans)} הלוואות פעילות · {fmt(s.loansDisbursed)} קיבלו שטר</div>
          </Link>
        )}
        {can.maternity && (
          <Link href="/admin/maternity" className="card kpi">
            <div className="l"><Baby />יולדות בטיפול</div>
            <div className="v num">{fmt(s.maternityActive)}</div>
            <div className="f num">תיקים פעילים · {fmt(s.maternityPending)} ממתינות</div>
          </Link>
        )}
      </div>

      <div className="nav" role="tablist" aria-label="אגפים">
        {visibleTabs.map(t => (
          <button key={t.id} role="tab" aria-selected={current.id === t.id} className={`tab${current.id === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
            {t.badge && <span className={`c ${t.badge.tone} num`}>{fmt(t.badge.n)}</span>}
          </button>
        ))}
      </div>

      <div className="layout">
        <div>
          {current.id === 'ov' && (
            <section className="panel on"><div className="grid">{ovCards}</div></section>
          )}

          {current.id === 'de' && (
            <section className="panel on">
              <div className="card">
                <DeptHead icon={<Users />} title="איגוד הצאצאים" sub={`${fmt(s.totalBeneficiaries)} רשומות במערכת`} href="/admin/beneficiaries" />
                <Mini items={[
                  { l: 'מאושרים', v: fmt(s.approved) }, { l: 'ממתינים לאישור', v: fmt(s.pending) },
                  { l: 'בדיקה מעמיקה', v: fmt(s.deepReview), color: s.deepReview ? 'var(--bad)' : undefined },
                  { l: 'נרשמו השבוע', v: fmt(s.newBeneficiariesWeek), color: 'var(--ok)' },
                ]} />
              </div>
              <div className="grid" style={{ marginTop: 16 }}>
                <div className="card s3">
                  <div className="ch"><h3>התפלגות הרשומות</h3></div>
                  <div className="body donut">
                    <Donut parts={regParts} total={regTotal} label="רשומות" size={160} />
                    <div className="legend">
                      {regLegend.map(l => <div key={l.name}><i style={{ background: l.c }} />{l.name}<b className="num">{fmt(l.v)}</b></div>)}
                    </div>
                  </div>
                </div>
                <div className="card s3">
                  <div className="ch"><h3>מה לעשות עכשיו</h3></div>
                  <div className="body hb">
                    <HBar label="לסיים בדיקות מעמיקות" value={fmt(s.deepReview)} pct={s.deepReview ? 100 : 0} color={C.bad} />
                    <HBar label="לאשר נרשמים חדשים" value={fmt(s.newBeneficiariesWeek)} pct={pctOf(s.newBeneficiariesWeek, Math.max(s.deepReview, 1))} color="var(--blue)" />
                    <p style={{ fontSize: 13, color: 'var(--mute)', marginTop: 4 }}>{fmt(s.pending)} רשומות ממתינות לאישור.</p>
                  </div>
                </div>
              </div>
            </section>
          )}

          {current.id === 'lo' && (
            <section className="panel on">
              <div className="card">
                <DeptHead icon={<Landmark />} title="גמ״ח הלוואות" sub={`${usd(s.disbursedAmount)} בהלוואות בפועל`} href="/admin/loans" />
                <Mini items={[
                  { l: 'ממתינות לאישור', v: fmt(s.pendingLoans), color: s.pendingLoans ? 'var(--warn)' : undefined },
                  { l: 'אושרו', v: fmt(s.loansApprovedTotal) }, { l: 'קיבלו שטר', v: fmt(s.loansDisbursed) }, { l: 'פעילות', v: fmt(s.activeLoans) },
                ]} />
              </div>
              <div className="grid" style={{ marginTop: 16 }}>
                <div className="card s4">
                  <div className="ch"><h3>שלבי ההלוואה</h3></div>
                  <div className="body">
                    <Columns height={200} barW={96} valueSize={15} data={[
                      { name: 'אושרו', value: s.loansApprovedTotal, color: C.navy }, { name: 'קיבלו שטר', value: s.loansDisbursed, color: C.navy2 },
                      { name: 'פעילות', value: s.activeLoans, color: C.gold }, { name: 'ממתינות', value: s.pendingLoans, color: C.warn },
                    ]} />
                  </div>
                </div>
                <div className="card s2">
                  <div className="ch"><h3>ארכיון (מערכת קודמת)</h3></div>
                  <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontSize: 28, fontWeight: 800 }} className="num">{fmt(s.legacyTakenCount)}<span style={{ fontSize: 15, color: 'var(--mute)', fontWeight: 500 }}> / {fmt(s.legacyCount)}</span></div>
                    <div className="track" style={{ height: 12 }}><span style={{ width: `${pctOf(s.legacyTakenCount, s.legacyCount)}%`, background: C.navy }} /></div>
                    <div style={{ fontSize: 13, color: 'var(--mute)' }}>נלקחו בפועל מתוך ההלוואות ההיסטוריות</div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {current.id === 'ma' && (
            <section className="panel on">
              <div className="card">
                <DeptHead icon={<Baby />} title="עזר יולדות" sub={`${fmt(s.maternityActive)} תיקים פעילים`} href="/admin/maternity" />
                <Mini items={[
                  { l: 'תיקים פעילים', v: fmt(s.maternityActive) },
                  { l: 'ממתינות לאישור', v: fmt(s.maternityPending), color: s.maternityPending ? 'var(--warn)' : undefined },
                  { l: 'בדיקה מעמיקה', v: fmt(s.maternityDeepReview), color: s.maternityDeepReview ? 'var(--bad)' : undefined },
                  { l: 'כרטיסי מזון נמסרו', v: delivered == null ? '—' : fmt(delivered) },
                ]} />
              </div>
              <div className="grid" style={{ marginTop: 16 }}>
                <div className="card s6">
                  <div className="ch"><h3>מצב התיקים</h3></div>
                  <div className="body hb">
                    <HBar label="פעילים" value={fmt(s.maternityActive)} pct={100} color={C.navy} />
                    <HBar label="ממתינות לאישור" value={fmt(s.maternityPending)} pct={pctOf(s.maternityPending, s.maternityActive)} color={C.warn} />
                    <HBar label="בדיקה מעמיקה" value={fmt(s.maternityDeepReview)} pct={pctOf(s.maternityDeepReview, s.maternityActive)} color={C.bad} />
                  </div>
                </div>
              </div>
            </section>
          )}

          {current.id === 'fo' && (
            <section className="panel on">
              <div className="card">
                <DeptHead icon={<UtensilsCrossed />} title="כרטיסי מזון ליולדות" sub="מלאי וחלוקה" href="/admin/maternity/cards" />
                <Mini items={[
                  { l: 'נקנו', v: purchased > 0 ? fmt(purchased) : '—' },
                  { l: 'נמסרו', v: delivered == null ? '—' : fmt(delivered) },
                  { l: 'במלאי', v: fmt(s.cardsRemaining), color: s.cardsRemaining < 5 ? 'var(--bad)' : 'var(--ok)' },
                  { l: 'ניצול', v: purchased > 0 && delivered != null ? `${Math.round(pctOf(delivered, purchased))}%` : '—' },
                ]} />
              </div>
              {purchased > 0 && delivered != null && (
                <div className="card" style={{ marginTop: 16 }}>
                  <div className="ch"><h3>ניצול המלאי</h3></div>
                  <div className="body">
                    <div className="track" style={{ height: 18, borderRadius: 9 }}><span style={{ width: `${pctOf(delivered, purchased)}%`, background: C.gold, borderRadius: 9 }} /></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--mute)', marginTop: 8 }}>
                      <span>{fmt(delivered)} נמסרו</span><span>{fmt(s.cardsRemaining)} נשארו</span>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {current.id === 'me' && (
            <section className="panel on">
              <div className="card">
                <DeptHead icon={<HandCoins />} title="סיוע רפואי" sub="בקשות ואישורים" href="/admin/financial-aid" />
                {s.aidPending + s.aidAwaiting + s.aidApproved === 0 ? (
                  <div className="empty">
                    <CheckCircle2 /><b>אין בקשות פתוחות</b><span>0 חדשות · 0 לאישור · 0 אושרו</span>
                  </div>
                ) : (
                  <Mini items={[
                    { l: 'בקשות חדשות', v: fmt(s.aidPending), color: s.aidPending ? 'var(--warn)' : undefined },
                    { l: 'נשלחו לאישור', v: fmt(s.aidAwaiting) }, { l: 'אושרו', v: fmt(s.aidApproved), color: 'var(--ok)' },
                  ]} />
                )}
              </div>
            </section>
          )}

          {current.id === 'ho' && (
            <section className="panel on">
              <div className="card">
                <DeptHead icon={<Gift />} title="חלוקות חגים" sub={s.holidayOpen ? `רישום פתוח: ${s.holidayName ?? ''}` : 'אין רישום פתוח כרגע'}
                  href="/admin/distributions" cta={s.holidayOpen ? 'כניסה לאגף' : 'פתיחת רישום'} />
                <Mini items={[
                  { l: 'רישום פתוח', v: s.holidayOpen ? 'כן' : 'אין', num: false },
                  { l: 'חלוקות בתכנון', v: fmt(s.distributionsPlanned) },
                  s.holidayOpen ? { l: 'נרשמים', v: fmt(s.holidayRegistered) } : { l: 'נרשמים', v: '[להשלים]', num: false },
                  s.holidayOpen ? { l: 'צפי תקציבי', v: ils(s.holidayExpected) } : { l: 'חלוקה הבאה', v: '[להשלים]', num: false },
                ]} />
              </div>
            </section>
          )}
        </div>

        <aside className="card queue" aria-label="תור העבודה">
          <div className="qh"><h3>תור העבודה שלך</h3><span>לפי דחיפות</span></div>
          {open.map(q => (
            <div key={`${q.tab}-${q.title}`} className="q" role="button" tabIndex={0}
              onClick={() => go(q.tab)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(q.tab) } }}>
              <span className="k num" style={toneStyle[q.tone]}>{fmt(q.n)}</span>
              <div><div className="t">{q.title}</div><div className="d">{q.dept}</div></div>
              <span className="go"><ChevronLeft size={16} /></span>
            </div>
          ))}
          {open.length === 0 && <div className="done"><CheckCircle2 />הכול מטופל, אין משימות פתוחות</div>}
          {doneDepts.length > 0 && open.length > 0 && <div className="qdiv" />}
          {open.length > 0 && doneDepts.map(d => <div key={d} className="done"><CheckCircle2 />{d}: אין פתוחות</div>)}
          {top && <div className="qfoot"><button className="btn" onClick={() => go(top.tab)}>להתחיל מהדחוף ביותר</button></div>}
        </aside>
      </div>
    </div>
  )
}
