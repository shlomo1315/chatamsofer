import JSZip from 'jszip'
import { KVITEL_LOGO, kvitelDocLayout, type KvitelDocPara, type KvitelDocRun } from './kvitelDocLayout'

export { shabbatLabel } from './kvitelDocLayout'

// ─────────────────────────────────────────────────────────────────────────────
// קובץ Word (docx) של הקוויטל — לפי הדוגמה "קויטל לציון רבינו הקדוש".
//
// ⚠️ נכתב ישירות כ-OOXML עם jszip (שכבר בתלויות) ולא עם ספריית docx: הקובץ
// פשוט — כותרת עם לוגו, כותרת משנה ושורת שמות לכל בקשה — והוא נשאר ניתן
// לעריכה ב-Word, כי הצוות מוסיף לפעמים שורה בכתב יד לפני ההדפסה.
// ─────────────────────────────────────────────────────────────────────────────

export interface KvitelDocInput {
  lines: string[]
  // תאריך ההגשה לציון — ממנו נגזרת "ערש"ק פרשת ..." (השבת שבאה אחריו).
  date: Date
  logoPng?: Uint8Array | null
}

const FONT = 'David'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ⚠️ סדר הילדים ב-rPr וב-pPr מחייב לפי סכמת OOXML (u אחרי sz, bidi אחרי pBdr).
// Word פוסל קובץ בסדר אחר כ"פגום" — זו הייתה התקלה בייצוא.
function run({ text, ...o }: KvitelDocRun): string {
  const rPr = [
    `<w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/>`,
    o.bold ? '<w:b/><w:bCs/>' : '',
    o.italic ? '<w:i/><w:iCs/>' : '',
    `<w:sz w:val="${o.size}"/><w:szCs w:val="${o.size}"/>`,
    o.underline ? '<w:u w:val="single"/>' : '',
    '<w:rtl/>',
  ].join('')
  return `<w:r><w:rPr>${rPr}</w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`
}

function para(inner: string, o: Omit<KvitelDocPara, 'run'> = {}): string {
  const pPr = [
    o.border ? `<w:pBdr><w:bottom w:val="${o.border}" w:sz="${o.border === 'double' ? 4 : 6}" w:space="4" w:color="000000"/></w:pBdr>` : '',
    '<w:bidi/>',
    `<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 0}"/>`,
    o.center ? '<w:jc w:val="center"/>' : '',
  ].join('')
  return `<w:p><w:pPr>${pPr}</w:pPr>${inner}</w:p>`
}

// לוגו 1.35 אינץ' (EMU: 914400 לאינץ').
const LOGO_EMU = 1234440
// שומרים על יחס הלוגו (KVITEL_LOGO).
const LOGO_EMU_H = Math.round(LOGO_EMU * KVITEL_LOGO.height / KVITEL_LOGO.width)

function logoDrawing(): string {
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${LOGO_EMU}" cy="${LOGO_EMU_H}"/><wp:docPr id="1" name="logo"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="logo.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${LOGO_EMU}" cy="${LOGO_EMU_H}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
}

const toXml = (p: KvitelDocPara) => para(p.run ? run(p.run) : '', p)

function header(titlesLayout: KvitelDocPara[], withLogo: boolean): string {
  const titles = titlesLayout.map(toXml).join('')
  if (!withLogo) return titles
  // טבלה בלי גבולות: הכותרות מימין, הלוגו משמאל (bidiVisual = סדר עמודות מימין לשמאל).
  const noBorders = '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>'
  return `<w:tbl><w:tblPr><w:bidiVisual/><w:tblW w:w="5000" w:type="pct"/>${noBorders}<w:tblLayout w:type="fixed"/></w:tblPr>`
    + '<w:tblGrid><w:gridCol w:w="7600"/><w:gridCol w:w="2300"/></w:tblGrid>'
    + `<w:tr><w:tc><w:tcPr><w:tcW w:w="7600" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${titles}</w:tc>`
    + `<w:tc><w:tcPr><w:tcW w:w="2300" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${para(logoDrawing(), { center: true })}</w:tc></w:tr></w:tbl>`
}

export function buildKvitelDocumentXml(input: KvitelDocInput): string {
  const layout = kvitelDocLayout(input.lines, input.date)
  const body = [header(layout.titles, !!input.logoPng), ...layout.body.map(toXml)].join('')
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">'
    + `<w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="900" w:right="1000" w:bottom="900" w:left="1000" w:header="500" w:footer="500" w:gutter="0"/><w:bidi/></w:sectPr></w:body></w:document>`
}

export async function buildKvitelDocx(input: KvitelDocInput): Promise<Uint8Array> {
  const zip = new JSZip()
  const withLogo = !!input.logoPng
  zip.file('[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Default Extension="png" ContentType="image/png"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '</Types>')
  zip.file('_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + '</Relationships>')
  zip.file('word/_rels/document.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + (withLogo ? '<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.png"/>' : '')
    + '</Relationships>')
  if (withLogo) zip.file('word/media/logo.png', input.logoPng!)
  zip.file('word/document.xml', buildKvitelDocumentXml(input))
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
