// ─────────────────────────────────────────────────────────────────────────────
// אילו הודעות שונו ולא נשמרו.
//
// 🔴 הבעיה שזה פותר: המנהל עורך נוסח, יוצא מהמסך, והשינוי אובד בלי סימן.
// ההודעה נראתה מעודכנת על המסך, והטלפון ממשיך להשמיע את הנוסח הישן.
//
// ⚠️ ההשוואה על *הטקסט בלבד*. שדה ה-audio משתנה מצד השרת (יצירת קול,
// העלאה, הסרה) ואינו עריכה של המשתמש — הכללתו הייתה מדליקה את סרגל
// השמירה מיד אחרי יצירת קול, כלומר על שינוי שכבר נשמר.
// ─────────────────────────────────────────────────────────────────────────────

export interface EditableMessage {
  text: string
  audio?: string | null
}

export function dirtyMessageKeys(
  current: Record<string, EditableMessage>,
  saved: Record<string, EditableMessage>,
): string[] {
  const out: string[] = []
  for (const [key, msg] of Object.entries(current ?? {})) {
    const now = String(msg?.text ?? '').trim()
    // ⚠️ מפתח שאין לו מקבילה שמורה נחשב שינוי: זו הודעה שנוספה ולא נשמרה.
    const before = String(saved?.[key]?.text ?? '').trim()
    if (now !== before) out.push(key)
  }
  return out
}
