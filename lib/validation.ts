// אימות תעודת זהות ישראלית כולל ספרת ביקורת (אלגוריתם לוהן)
export function validateIsraeliId(raw: string): boolean {
  const id = raw.replace(/\D/g, '').padStart(9, '0')
  if (id.length !== 9) return false
  let sum = 0
  for (let i = 0; i < 9; i++) {
    let d = parseInt(id[i]) * (i % 2 === 0 ? 1 : 2)
    if (d > 9) d -= 9
    sum += d
  }
  return sum % 10 === 0
}

export function validatePhone(p: string): boolean {
  const d = p.replace(/\D/g, '')
  return d.length === 10 && d.startsWith('05')
}
