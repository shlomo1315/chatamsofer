// ניסוח תוצאת יצירת ההקלטות בקול שלמה, לתצוגה בכפתור במסך הנוסחים.
import type { SyncResult } from './voiceFiles'

export type VoiceReply = Partial<SyncResult> & { error?: string }

export function describeVoiceSync(httpOk: boolean, r: VoiceReply): { ok: boolean; text: string } {
  const created = r.created ?? 0, failed = r.failed ?? 0, total = r.total ?? 0
  if (!httpOk && !r.total && !r.error) return { ok: false, text: 'היצירה נכשלה. נסו שוב.' }
  if (r.error) {
    const done = created ? `נוצרו ${created} הקלטות, ` : ''
    return { ok: false, text: `${done}${failed ? `${failed} נכשלו. ` : ''}${r.error}. ההודעות שאין להן הקלטה נשמעות בקול הרגיל.` }
  }
  if (!created) return { ok: true, text: `הכול מעודכן: ${total} הודעות כבר בקולך.` }
  return { ok: true, text: `נוצרו ${created} הקלטות חדשות (מתוך ${total} הודעות).` }
}
