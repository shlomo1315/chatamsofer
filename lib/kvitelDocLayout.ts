import { HDate, Locale, gematriya, getSedra } from '@hebcal/core'

// ─────────────────────────────────────────────────────────────────────────────
// מבנה הקוויטל — מקור אחד לקובץ ה-Word (lib/kvitelDocx.ts) ולתצוגה המקדימה
// במסך (app/admin/kvitel/KvitelPreview.tsx), כדי שמה שרואים הוא מה שמקבלים.
//
// ⚠️ בלי jszip ובלי node: הקובץ נטען גם בדפדפן.
// יחידות כמו ב-Word: size בחצאי נקודה, before/after ב-twips (1/20 נקודה).
// ─────────────────────────────────────────────────────────────────────────────

export interface KvitelDocRun { text: string; size: number; bold?: boolean; italic?: boolean; underline?: boolean }
export interface KvitelDocPara { run?: KvitelDocRun; center?: boolean; border?: 'single' | 'double'; before?: number; after?: number }
export interface KvitelDocLayout {
  // הכותרות — מימין ללוגו כשיש לוגו
  titles: KvitelDocPara[]
  body: KvitelDocPara[]
}

const stripNiqqud = (s: string) => s.replace(/[֑-ׇ]/g, '')

// "ערש"ק פרשת וארא תשפ"ו" — השבת הקרובה (או היום, אם שבת).
// ⚠️ בשבת של חג אין פרשה — אז רק "ערש"ק" והשנה.
export function shabbatLabel(date: Date): string {
  const hd = new HDate(date).onOrAfter(6)
  const year = hd.getFullYear()
  const sedra = getSedra(year, true).lookup(hd)
  const yearHe = gematriya(year % 1000).replace(/״/g, '"').replace(/׳/g, "'")
  if (sedra.chag || !sedra.parsha?.length) return `ערש"ק ${yearHe}`
  const parsha = sedra.parsha.map(p => stripNiqqud(Locale.gettext(p, 'he'))).join('-')
  return `ערש"ק פרשת ${parsha} ${yearHe}`
}

export function kvitelDocLayout(lines: string[], date: Date): KvitelDocLayout {
  return {
    titles: [
      { run: { text: 'קויטל לציון רבינו הקדוש', size: 40, bold: true }, center: true },
      { run: { text: 'מרנא ורבנא בעל החתם סופר זיע"א', size: 44, bold: true }, center: true },
      { run: { text: `[${shabbatLabel(date)}]`, size: 26, bold: true }, center: true, before: 80 },
    ],
    body: [
      { border: 'double', after: 360 },
      { run: { text: 'רשימת שמות ובקשות לתפילה', size: 34, bold: true, italic: true, underline: true }, center: true, after: 240 },
      { border: 'single' },
      ...lines.map((text): KvitelDocPara => ({ run: { text, size: 26, italic: true }, border: 'single', before: 100, after: 60 })),
    ],
  }
}

// הלוגו בשחור-לבן — אותו לוגו כמו בטופס הציבורי (app/kvitel/page.tsx). רוחב/גובה לשמירת היחס.
export const KVITEL_LOGO = { file: 'logo-heichal-bw.png', width: 900, height: 903 }
