// תיאור סיבות המלגה בעברית (מסך הניהול והייצוא).
export function reasonsText(r: Record<string, unknown> | null | undefined): string {
  if (!r) return ''
  const out: string[] = []
  if (r.groom_over_24) out.push('חתן מעל 24')
  if (r.bride_over_22) out.push('כלה מעל 22')
  if (r.orphan === 'groom') out.push('חתן יתום')
  if (r.orphan === 'bride') out.push('כלה יתומה')
  if (r.zivush_groom && r.zivush_bride) out.push('זיוו"ש חתן וכלה')
  else if (r.zivush_groom) out.push('זיוו"ש חתן')
  else if (r.zivush_bride) out.push('זיוו"ש כלה')
  if (r.medical) out.push('רפואי')
  return out.join(', ')
}
