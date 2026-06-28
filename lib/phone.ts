// עזרי טלפון משותפים — נרמול ומיסוך מספרים ישראליים.

// נרמול מספר טלפון ישראלי לפורמט אחיד (10 ספרות: 05XXXXXXXX)
export function normalizePhone(raw: string | null | undefined): string {
  let p = String(raw ?? '').replace(/\D/g, '')
  if (p.startsWith('00972')) p = '0' + p.slice(5)
  else if (p.startsWith('972')) p = '0' + p.slice(3)
  return p
}

// מיסוך לתצוגה: שלוש ספרות ראשונות + שלוש אחרונות, למשל 052****123.
// מספר קצר מדי מוחזר ממוסך כולו.
export function maskPhone(raw: string | null | undefined): string {
  const d = normalizePhone(raw)
  if (d.length < 6) return d ? '****' : ''
  return `${d.slice(0, 3)}****${d.slice(-3)}`
}

// מיסוך כתובת מייל לתצוגה, למשל 4363773@gmail.com → 43*****@G...OM.
// מציג 2 תווים ראשונים של השם, ואות ראשונה + שתי אותיות אחרונות של הדומיין.
export function maskEmail(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim()
  const at = s.indexOf('@')
  if (at < 1 || at === s.length - 1) return s ? '****' : ''
  const local = s.slice(0, at)
  const domain = s.slice(at + 1)
  const localMask = `${local.slice(0, 2)}*****`
  const domainMask = domain.length >= 2
    ? `${domain[0].toUpperCase()}...${domain.slice(-2).toUpperCase()}`
    : domain.toUpperCase()
  return `${localMask}@${domainMask}`
}
