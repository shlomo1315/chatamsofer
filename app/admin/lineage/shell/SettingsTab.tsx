'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import type { QueueId, ShellSettings, ShellTab } from './types'

interface Props {
  settings: ShellSettings
  onChange: (s: ShellSettings) => void
  canEdit: boolean
  canAdd: boolean
  permissions: ReactNode
  onShare: () => void
  onQueue: (q: QueueId) => void
  onAddGeneration: () => void
  onPrint: () => void
  onLegacy: () => void
}

const Sw = ({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) => (
  <button className={`sw ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={onClick} />
)

export default function SettingsTab({ settings: s, onChange, canAdd, permissions, onShare, onQueue, onAddGeneration, onPrint, onLegacy }: Props) {
  const set = (p: Partial<ShellSettings>) => onChange({ ...s, ...p })
  const opens: { v: ShellTab; l: string }[] = [{ v: 'tree', l: 'עץ' }, { v: 'fan', l: 'מניפה' }, { v: 'work', l: 'טיפול' }]
  return (
    <>
      <div className="safe">
        <div><b>הנתונים לא זזים.</b> כל ההגדרות והכלים כאן הם אותם כלים שקיימים היום, רק מרוכזים במקום אחד. שום טבלה במסד לא משתנה.</div>
      </div>
      <div className="sets">
        <div className="card sc">
          <h3>מיזוג והתאמה</h3><p className="d">איך המערכת מזהה כפילויות ומה היא עושה לבד · נשמר במכשיר הזה</p>
          <div className="opt"><div className="ol"><b>רגישות התאמה</b><span>«בוודאות»: רק שם זהה ואותו הורה. «מקורב»: גם שמות דומים</span></div>
            <div className="seg">
              <button className={s.sens === 'exact' ? 'on' : ''} onClick={() => set({ sens: 'exact' })}>בוודאות</button>
              <button className={s.sens === 'near' ? 'on' : ''} onClick={() => set({ sens: 'near' })}>מקורב</button>
            </div></div>
          <div className="opt"><div className="ol"><b>מיזוג בטוח אוטומטי</b><span>תזכורת במסך הטיפול למזג את הקבוצות הבטוחות; המיזוג עצמו תמיד באישור שלך</span></div>
            <Sw on={s.autoSafe} label="מיזוג בטוח אוטומטי" onClick={() => set({ autoSafe: !s.autoSafe })} /></div>
          <div className="opt"><div className="ol"><b>אישור לפי שם בלבד</b><span>לאפשר אישור שרשרת כשאין ת״ז, רק לפי שם</span></div>
            <Sw on={s.nameOnly} label="אישור לפי שם" onClick={() => set({ nameOnly: !s.nameOnly })} /></div>
          <div className="opt"><div className="ol"><b>אישורים חריגים בסדר הדורות</b><span>להתריע כשדור לא מסתדר בסדר הצפוי</span></div>
            <Sw on={s.orderWarn} label="אישורים חריגים" onClick={() => set({ orderWarn: !s.orderWarn })} /></div>
        </div>
        <div className="card sc">
          <h3>תצוגה ועריכה</h3><p className="d">מה רואים בעץ ומי יכול לשנות</p>
          <div className="opt"><div className="ol"><b>הסתרת כפתורי עריכה</b><span>בתצוגה הקלאסית: העץ נקי, עריכה רק דרך כרטיס הפרטים והטיפול</span></div>
            <Sw on={s.hideEdit} label="הסתרת כפתורים" onClick={() => set({ hideEdit: !s.hideEdit })} /></div>
          <div className="opt"><div className="ol"><b>תצוגת פתיחה</b><span>מה נפתח כשנכנסים לעץ הדורות</span></div>
            <div className="seg">{opens.map(o => <button key={o.v} className={s.open === o.v ? 'on' : ''} onClick={() => set({ open: o.v })}>{o.l}</button>)}</div></div>
          <div className="opt"><div className="ol"><b>סימון ממתינים בעץ</b><span>נקודה כתומה על ענף שיש בו ממתינים</span></div>
            <Sw on={s.markPending} label="סימון ממתינים" onClick={() => set({ markPending: !s.markPending })} /></div>
          <div className="opt"><div className="ol"><b>אילן צאצאים בהדפסה</b><span>הדפסה כעץ מעוצב במקום רשימה</span></div>
            <Sw on={s.printDesc} label="אילן צאצאים" onClick={() => set({ printDesc: !s.printDesc })} /></div>
        </div>
        <div className="card sc wide">
          <h3>הרשאות שיתוף ענף</h3><p className="d">משפחות שקיבלו קישור לצפייה או לעריכה של הענף שלהן</p>
          {permissions}
          <div style={{ marginTop: 12 }}><button className="btn p" onClick={onShare}>שיתוף ענף חדש (בחר ענף בעץ)</button></div>
        </div>
        <div className="card sc wide">
          <h3>כלים ותחזוקה</h3><p className="d">פעולות שרצות פעם בכמה זמן. כל כלי מראה תצוגה מקדימה לפני שינוי.</p>
          <div className="tools">
            <button className="tool" onClick={() => onQueue('ghost')}><b>סריקת העץ</b><span>דור אחרון כפול, צמתי רפאים ושבירות</span></button>
            <button className="tool" onClick={() => onQueue('audit')}><b>ביקורת תקינות</b><span>בדיקת קשרים, דורות והורים חסרים</span></button>
            <Link className="tool" href="/admin/settings"><b>השלמת צמתים</b><span>רק למשפחות שהוסיפו דורות ידנית (בהגדרות המערכת)</span></Link>
            <Link className="tool" href="/admin/settings"><b>תיקון דחיות</b><span>לפי משפחה, ת״ז ותאריך דחייה (בהגדרות המערכת)</span></Link>
            <div className="tool" style={{ opacity: .6 }}><b>ייבוא</b><span>טעינת דורות מקובץ: זמין כרגע דרך ה-API בלבד, בלי מסך</span></div>
            {canAdd && <button className="tool" onClick={onAddGeneration}><b>הוסף דור חדש</b><span>הוספה ידנית תחת הורה קיים</span></button>}
            <Link className="tool" href="/admin/lineage/approved"><b>מאושרים</b><span>כל הייחוסים שאושרו, עם מי אישר ומתי</span></Link>
            <Link className="tool" href="/admin/lineage/auto-approved"><b>אושרו אוטומטית</b><span>משפחות שאושרו ללא החלטה מתועדת</span></Link>
            <button className="tool" onClick={onPrint}><b>ייצוא והדפסה</b><span>PDF של העץ, של גזע או של ענף</span></button>
            <button className="tool" onClick={onLegacy}><b>תצוגה קלאסית</b><span>המסך הישן במלואו, כולל מצב מיזוג ידני וטבלה</span></button>
          </div>
        </div>
      </div>
    </>
  )
}
