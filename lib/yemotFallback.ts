// שלוחת הזיכויים: במקום לנתק בסוף השיחה, מחזירים את המתקשר לתפריט (YEMOT_CREDITS_FALLBACK_FOLDER).
export function withFallbackFolder(body: string, folder?: string): string {
  const target = (folder ?? '').trim()
  if (!target || /[&=\s]/.test(target)) return body
  return body.replace(/go_to_folder=hangup/g, `go_to_folder=${target}`)
}
