import s from '@/app/admin/beneficiaries/[id]/LineageChainChips.module.css'

// 🔴 המקום היחיד שמציג סדר דורות לקריאה בלבד, בעיצוב של LineageChainChips.
// כל מסך שמציג שרשרת (כרטסת מהירה, התראה, שער אישור, בקשות, קישור תיקון) משתמש בו,
// והשרשרת עצמה תמיד מ-displayChain.
// ⚠️ בלי color הכול ניטרלי: הצבע מחושב מול הקובץ המאושר בשרת, וצביעה בלי חישוב הייתה
// מציגה סטטוס שלא נבדק. הצבעים והעריכה בכרטסת המלאה.
export interface StairGen {
  generation: number
  name: string
  relation?: string | null
  /** סטטוס אישור — ירוק מאושר, כתום ממתין, אדום חריג. חסר = ניטרלי. */
  color?: 'green' | 'orange' | 'red'
  /** תגית קצרה ליד השם (למשל "זה אתם"). */
  badge?: string
}

const TONE = { green: '', orange: s.o, red: s.r } as const

const LABEL = { green: 'מאושרים', orange: 'ממתינים', red: 'חריג' } as const
const VAR = { green: '--g', orange: '--o', red: '--r' } as const

// framed: כותרת עם מונים בראש ומקרא צבעים בתחתית, כמו בכרטסת המלאה (בכרטסת הזוג).
// ⚠️ המונים והמקרא של הצבעים מוצגים רק כשיש צבעים, כדי לא להציג סטטוס שלא חושב.
export default function LineageStairs({ gens, framed }: { gens: StairGen[]; framed?: boolean }) {
  const counts = (['green', 'orange', 'red'] as const).map((c) => ({ c, n: gens.filter((g) => g.color === c).length })).filter((x) => x.n > 0)
  const list = (
      <ol className={s.tree}>
        {gens.map((g, i) => (
          <li key={`${g.generation}-${i}`} className={`${s.gen} ${g.color ? TONE[g.color] : s.n}`} style={{ '--i': i } as React.CSSProperties}>
            <span className={s.dot}>{g.generation}</span>
            <div className={s.nodeWrap}>
              <div className={s.node} style={{ cursor: 'default' }}>
                <span className={s.txt}>
                  <span className={s.nm}>{g.name}</span>
                  <span className={s.meta}>
                    {g.relation === 'son_in_law' && <><span className={s.rel}>חתן</span><span className={s.sep} /></>}
                    {g.badge && <><span className={s.rel}>{g.badge}</span><span className={s.sep} /></>}
                    <span className={s.par}>{i > 0 ? `אביו: ${gens[i - 1].name.split(' ומרת')[0].split(',')[0]}` : 'ראש השושלת'}</span>
                  </span>
                </span>
              </div>
            </div>
          </li>
        ))}
      </ol>
  )
  if (!framed) return <div className={`${s.root} ${s.ro}`}>{list}</div>
  return (
    <div className={`${s.root} ${s.ro}`}>
      <div className={s.head}>
        <div>
          <h2>סדר הדורות</h2>
          <p>כל דור נכנס מדרגה אחת פנימה מאביו.</p>
        </div>
        <div className={s.tally}>
          <span><b>{gens.length}</b> דורות</span>
          {counts.map(({ c, n }) => <span key={c} style={{ '--c': `var(${VAR[c]})` } as React.CSSProperties}><i /><b>{n}</b> {LABEL[c]}</span>)}
        </div>
      </div>
      <div className={s.panel}>
        {list}
        {counts.length > 0 && (
          <div className={s.foot}>
            <div className={s.legend}>
              <span><i style={{ '--c': 'var(--g)' } as React.CSSProperties} />מאושר</span>
              <span><i className={s.hollow} />ממתין לאימות</span>
              <span><i style={{ '--c': 'var(--r)' } as React.CSSProperties} />חריג: בדיקה מעמיקה</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
