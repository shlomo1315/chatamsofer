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

export default function LineageStairs({ gens }: { gens: StairGen[] }) {
  return (
    <div className={`${s.root} ${s.ro}`}>
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
    </div>
  )
}
