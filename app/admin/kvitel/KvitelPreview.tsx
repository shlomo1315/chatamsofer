'use client'

import { useRef, useState } from 'react'
import { Download, Loader2, Printer } from 'lucide-react'
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

function fileNameFrom(res: Response): string {
  const cd = res.headers.get('Content-Disposition') ?? ''
  const utf = /filename\*=UTF-8''([^;]+)/i.exec(cd)
  if (utf) return decodeURIComponent(utf[1])
  return /filename="([^"]+)"/i.exec(cd)?.[1] ?? 'kvitel.docx'
}

// הורדת קובץ ה-Word מנתיב הייצוא. מחזיר הודעת שגיאה, או null כשהקובץ ירד.
export async function downloadKvitel(href: string): Promise<string | null> {
  try {
    const res = await fetch(href)
    if (!res.ok) return (await res.json().catch(() => ({}))).error || 'ההורדה נכשלה'
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = fileNameFrom(res)
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return null
  } catch {
    return 'ההורדה נכשלה. בדוק את החיבור ונסה שוב.'
  }
}

// הדפסה של הדף בלבד: עותק שלו ב-iframe נסתר, ברוחב A4 מלא (210mm = 595pt, אז pt() בגודל אמיתי).
function printSheet(page: HTMLElement) {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;inset-inline-start:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  const win = frame.contentWindow
  if (!doc || !win) { frame.remove(); return }
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')].map(n => n.outerHTML).join('')
  doc.open()
  doc.write(`<!doctype html><html dir="rtl" lang="he"><head><base href="${location.origin}/">${styles}`
    + '<style>@page{size:A4;margin:0}html,body{margin:0;background:#fff}'
    + '.kvitel-print{container-type:inline-size;width:210mm}'
    + '.kvitel-print>div{max-width:none!important;width:100%!important;box-shadow:none!important;aspect-ratio:auto!important}</style>'
    + `</head><body><div class="kvitel-print">${page.outerHTML}</div></body></html>`)
  doc.close()
  let done = false
  const go = () => {
    if (done) return
    done = true
    win.focus()
    win.print()
    setTimeout(() => frame.remove(), 1000)
  }
  const img = doc.querySelector('img')
  if (img && !img.complete) {
    img.addEventListener('load', go, { once: true })
    img.addEventListener('error', go, { once: true })
    setTimeout(go, 3000)
  } else go()
}

// downloadHref — נתיב הייצוא לכפתור "הורדה". בלי נתיב, downloadNote מסביר למה אין הורדה.
export function KvitelSheet({ lines, date = new Date(), downloadHref, downloadNote }: {
  lines: string[]
  date?: Date
  downloadHref?: string
  downloadNote?: string
}) {
  const layout = kvitelDocLayout(lines, date)
  const pageRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function download() {
    if (!downloadHref) return
    setBusy(true)
    setError('')
    setError(await downloadKvitel(downloadHref) ?? '')
    setBusy(false)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-slate-200 p-3 sm:p-6">
        <div className="mx-auto max-w-[540px]" style={{ containerType: 'inline-size' }}>
          {/* דף A4 (210×297) מוקטן לרוחב המסגרת; שוליים כמו בקובץ (1000/900 twips) */}
          <div ref={pageRef} dir="rtl" className="w-full break-words bg-white text-black shadow-md"
            style={{ aspectRatio: '210 / 297', fontFamily: 'David, "David Libre", "Frank Ruehl CLM", serif', padding: `${pt(45)} ${pt(50)}`, lineHeight: 1.25 }}>
            <div className="flex items-center" style={{ gap: pt(8) }}>
              <div className="min-w-0 flex-1">{layout.titles.map((p, i) => <Para key={i} p={p} />)}</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/${KVITEL_LOGO.file}`} alt="היכל החתם סופר" className="w-[22%] max-w-[97pt] shrink-0" />
            </div>
            {layout.body.map((p, i) => <Para key={i} p={p} />)}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        <button type="button" onClick={download} disabled={!downloadHref || busy}
          className="flex items-center justify-center gap-2 rounded-lg bg-[#1B3256] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
          הורדה
        </button>
        <button type="button" onClick={() => pageRef.current && printSheet(pageRef.current)}
          className="flex items-center justify-center gap-2 rounded-lg border border-[#1B3256]/40 bg-white px-6 py-2.5 text-sm font-semibold text-[#1B3256]">
          <Printer className="h-4 w-4" aria-hidden />
          הדפסה
        </button>
      </div>
      {!downloadHref && downloadNote && <p className="text-center text-sm text-slate-600">{downloadNote}</p>}
      {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-center text-sm text-rose-800">{error}</p>}
    </div>
  )
}

export default function KvitelPreview({ open, onClose, lines, title = 'תצוגה מקדימה של הקובץ', downloadHref, downloadNote }: {
  open: boolean
  onClose: () => void
  lines: string[]
  title?: string
  downloadHref?: string
  downloadNote?: string
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="lg">
      {lines.length
        ? <KvitelSheet lines={lines} downloadHref={downloadHref} downloadNote={downloadNote} />
        : <p className="py-6 text-center text-slate-500">אין שמות להצגה.</p>}
    </Modal>
  )
}
