'use client'

import Modal from '@/components/ui/Modal'
import { KVITEL_LOGO, kvitelDocLayout, type KvitelDocPara } from '@/lib/kvitelDocLayout'

// תצוגה מקדימה של קובץ ה-Word — נבנית מאותו מבנה (lib/kvitelDocLayout.ts)
// שממנו נכתב הקובץ, כך שכל שינוי בעיצוב הקובץ מופיע כאן אוטומטית.
// יחידות Word: size בחצאי נקודה, ריווח ב-twips (1/20 נקודה).

// נקודות ביחס לרוחב A4 (595pt) — בטלפון הדף כולו מצטמצם ולא נשבר לשורות אחרות.
const pt = (n: number) => `min(${n}pt, calc(${n} * 100cqw / 595))`

function Para({ p }: { p: KvitelDocPara }) {
  const border = p.border === 'double' ? '3px double #000' : p.border === 'single' ? '1px solid #000' : undefined
  return (
    <p style={{
      margin: 0,
      marginTop: pt((p.before ?? 0) / 20),
      marginBottom: pt((p.after ?? 0) / 20),
      paddingBottom: border ? pt(4) : undefined,
      borderBottom: border,
      textAlign: p.center ? 'center' : 'right',
      minHeight: p.run ? undefined : '1px',
    }}>
      {p.run && (
        <span style={{
          fontSize: pt(p.run.size / 2),
          fontWeight: p.run.bold ? 700 : 400,
          fontStyle: p.run.italic ? 'italic' : 'normal',
          textDecoration: p.run.underline ? 'underline' : 'none',
        }}>{p.run.text}</span>
      )}
    </p>
  )
}

export function KvitelSheet({ lines, date = new Date() }: { lines: string[]; date?: Date }) {
  const layout = kvitelDocLayout(lines, date)
  return (
    <div className="rounded-lg bg-slate-200 p-2 sm:p-5" style={{ containerType: 'inline-size' }}>
      {/* דף A4 מוקטן; שוליים כמו בקובץ (1000/900 twips) */}
      <div dir="rtl" className="mx-auto w-full max-w-[595pt] break-words bg-white text-black shadow"
        style={{ fontFamily: 'David, "David Libre", "Frank Ruehl CLM", serif', padding: `${pt(45)} ${pt(50)}`, lineHeight: 1.25 }}>
        <div className="flex items-center" style={{ gap: pt(8) }}>
          <div className="min-w-0 flex-1">{layout.titles.map((p, i) => <Para key={i} p={p} />)}</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/${KVITEL_LOGO.file}`} alt="היכל החתם סופר" className="w-[22%] max-w-[97pt] shrink-0" />
        </div>
        {layout.body.map((p, i) => <Para key={i} p={p} />)}
      </div>
    </div>
  )
}

export default function KvitelPreview({ open, onClose, lines, title = 'תצוגה מקדימה של הקובץ' }: {
  open: boolean
  onClose: () => void
  lines: string[]
  title?: string
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="xl">
      {lines.length
        ? <KvitelSheet lines={lines} />
        : <p className="py-6 text-center text-slate-500">אין שמות להצגה.</p>}
    </Modal>
  )
}
