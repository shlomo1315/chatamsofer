// המרת תאריך לועזי לתאריך עברי מלא (גימטריה) — בטוח לצד-לקוח (Intl + גימטריה).
// לדוגמה: "כ״א תמוז תשפ״ו"
const GEM_ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט']
const GEM_TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ']
const GEM_HUND = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק']

function gematria(n: number): string {
  let s = GEM_HUND[Math.floor(n / 100)] || ''
  const r = n % 100
  if (r === 15) s += 'טו'
  else if (r === 16) s += 'טז'
  else { s += GEM_TENS[Math.floor(r / 10)] || ''; s += GEM_ONES[r % 10] || '' }
  return s
}
function withPunct(s: string): string {
  if (s.length === 1) return s + '׳'
  return s.slice(0, -1) + '״' + s.slice(-1)
}

export function toHebrewDate(d?: string | Date | null): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return ''
  try {
    const day = parseInt(new Intl.DateTimeFormat('en-u-ca-hebrew', { day: 'numeric' }).format(date), 10)
    const year = parseInt(new Intl.DateTimeFormat('en-u-ca-hebrew', { year: 'numeric' }).format(date), 10)
    const month = new Intl.DateTimeFormat('he-u-ca-hebrew', { month: 'long' }).format(date).replace(/[֑-ׇ]/g, '')
    return `${withPunct(gematria(day))} ${month} ${withPunct(gematria(year % 1000))}`
  } catch { return '' }
}
