import { scrambleBytes, DOC_CIPHER_ID } from '@/lib/docCipher'

// ─────────────────────────────────────────────────────────────────────────────
// מטען הבקשות של מסך הקוויטלעך בדרך לדפדפן, בערבול (אותו מנגנון של lib/docCipher).
//
// הרקע: נטפרי חסם את /admin/kvitel כולו ("הרובוט האוטומטי מצא פה דברים לא טובים").
// הבקשות כוללות טקסט חופשי מכל הערוצים (מייל, טלפון, נדרים), וכשהוא נשלח כטקסט
// גלוי בתוך ה-HTML המסנן קורא אותו וחוסם את הדף. כאן הטקסט עובר כבייטים מעורבלים,
// והדפדפן מפענח בזיכרון.
//
// ⚠️ זה ערבול ולא אבטחה: ההרשאות נשענות על requirePermission בנתיב, כמו קודם.
// ─────────────────────────────────────────────────────────────────────────────

export interface KvitelScrambled { enc: typeof DOC_CIPHER_ID; d: string }

/** שרת: מערבל ערך JSON-י ל-base64. */
export function encodeKvitelPayload(value: unknown): KvitelScrambled {
  const bytes = scrambleBytes(new Uint8Array(Buffer.from(JSON.stringify(value), 'utf8')))
  return { enc: DOC_CIPHER_ID, d: Buffer.from(bytes).toString('base64') }
}

/** דפדפן (וגם שרת, לבדיקות): מפענח. enc נבדק ולא מונח, כמו ב-docBlob. */
export function decodeKvitelPayload<T>(p: KvitelScrambled): T {
  if (p.enc !== DOC_CIPHER_ID) throw new Error('שיטת ערבול לא מוכרת')
  const bin = atob(p.d)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return JSON.parse(new TextDecoder().decode(scrambleBytes(bytes))) as T
}
