// פירוק כתובת מאוחדת "רחוב בית/דירה" (למשל "הרצל 12/3") לחלקיה.
//
// ⚠️ יש רחובות ששמם עצמו מסתיים במספר (בבני ברק: "רח 288"), כך ש-regex לבדו
// לא יודע איפה נגמר הרחוב: "רח 288 339/3" ייקרא כרחוב "רח" ובית "288 339".
// לכן כשיש את רשימת הרחובות של העיר — מחפשים קודם קידומת שהיא רחוב מהרשימה
// (הארוכה ביותר), והשאר הוא מספר הבית והדירה. regex רק כשאין רשימה או התאמה.

export interface SplitAddress {
  street: string
  houseNumber: string
  apartment: string
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

// מספר בית (מתחיל בספרה) + "/דירה" אופציונלי
const HOUSE_RE = /^(\d[\d\-א-ת\s]*)(?:\/([^/]+))?$/

export function splitAddress(addr: string, streets: readonly string[] = []): SplitAddress {
  const a = norm(addr)
  if (!a) return { street: '', houseNumber: '', apartment: '' }

  if (streets.length > 0) {
    const matches = streets
      .map(norm)
      .filter(s => s && (a === s || a.startsWith(s + ' ')))
      .sort((x, y) => y.length - x.length)
    if (matches.length > 0) {
      // עדיפות לרחוב שמשאיר אחריו מספר בית תקין ("X 5 7" כשיש גם "X" וגם "X 5")
      for (const s of matches) {
        const rest = a.slice(s.length).trim()
        const m = rest.match(HOUSE_RE)
        if (m) return { street: s, houseNumber: m[1].trim(), apartment: (m[2] ?? '').trim() }
      }
      const s = matches[0]
      const [house = '', apt = ''] = a.slice(s.length).trim().split('/')
      return { street: s, houseNumber: house.trim(), apartment: apt.trim() }
    }
  }

  const m = a.match(/^(.+?)\s+(\d[\d\-א-ת\s]*)(?:\/([^/]+))?$/)
  if (!m) return { street: a, houseNumber: '', apartment: '' }
  return { street: m[1].trim(), houseNumber: m[2].trim(), apartment: (m[3] ?? '').trim() }
}
