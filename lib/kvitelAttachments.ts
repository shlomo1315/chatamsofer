import JSZip from 'jszip'

// ─────────────────────────────────────────────────────────────────────────────
// חילוץ טקסט מקבצים שמצורפים למייל קוויטל (Word, PDF, טקסט), כדי שהשמות שבהם
// יעברו לאותו פענוח של גוף המייל (parseKvitelEmailText). קובץ מסוג אחר (תמונה,
// doc ישן) מדולג: אין ממנו טקסט, והמייל נקלט רק אם יש שמות בגוף.
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024

export interface KvitelAttachmentFile { filename: string; mimeType: string; buffer: Buffer }
export interface KvitelAttachmentText { filename: string; text: string }

type Kind = 'docx' | 'pdf' | 'text'

export function attachmentKind(filename: string, mimeType: string): Kind | null {
  const ext = filename.toLowerCase().split('.').pop() ?? ''
  const mt = mimeType.toLowerCase()
  if (ext === 'docx' || mt.includes('wordprocessingml')) return 'docx'
  if (ext === 'pdf' || mt === 'application/pdf') return 'pdf'
  if (ext === 'txt' || mt.startsWith('text/plain')) return 'text'
  return null
}

const unescapeXml = (s: string) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&')

// פסקה ושורה בטבלה הן שורה. תא בטבלה מופרד ברווח, כדי ש"משה | בן | שרה" יהיה "משה בן שרה".
export async function docxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)
  const xml = await zip.file('word/document.xml')?.async('string')
  if (!xml) return ''
  return unescapeXml(xml
    .replace(/<w:tab\/>/g, ' ')
    .replace(/<w:br[^>]*\/>/g, '\n')
    // הפסקה האחרונה בתא לא שוברת שורה: התאים של שורה בטבלה נשארים באותה שורה
    .replace(/<\/w:p>\s*<\/w:tc>/g, '</w:tc>')
    .replace(/<\/w:tc>/g, ' ')
    .replace(/<\/w:tr>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, ''))
    .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).join('\n')
}

async function pdfText(buffer: Buffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: false }).promise
  const out: string[] = []
  for (let p = 1; p <= Math.min(doc.numPages, 20); p++) {
    const items = (await (await doc.getPage(p)).getTextContent()).items as { str?: string; hasEOL?: boolean }[]
    out.push(items.map(i => (i.str ?? '') + (i.hasEOL ? '\n' : '')).join(''))
  }
  return out.join('\n')
}

/** טקסט מכל קובץ שאפשר לקרוא. קובץ שנכשל נרשם ביומן ומדולג, בלי להפיל את הקליטה. */
export async function extractAttachmentTexts(files: KvitelAttachmentFile[]): Promise<KvitelAttachmentText[]> {
  const out: KvitelAttachmentText[] = []
  for (const f of files) {
    const kind = attachmentKind(f.filename, f.mimeType)
    if (!kind || f.buffer.length > MAX_ATTACHMENT_BYTES) continue
    try {
      const text = kind === 'docx' ? await docxText(f.buffer)
        : kind === 'pdf' ? await pdfText(f.buffer)
          : f.buffer.toString('utf8')
      if (text.trim()) out.push({ filename: f.filename, text })
    } catch (e) {
      console.error('[kvitel-email] קריאת קובץ מצורף נכשלה:', f.filename, e instanceof Error ? e.message : String(e))
    }
  }
  return out
}
