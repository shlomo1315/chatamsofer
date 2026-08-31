import { describe, it, expect } from 'vitest'
import { IVR_EXTENSIONS } from './ivrMap'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 מפת המערכת הטלפונית — התכונות שהמסך נשען עליהן.
//
// ⚠️ המפה היא תיאור, ולכן קל לה להתיישן בשקט. הטסטים כאן נועלים את מה
// שהמסך *מניח* עליה: שכל שלוחה ניתנת לזיהוי, ושמסלול יוצא מסומן ככזה.
// ─────────────────────────────────────────────────────────────────────────────

describe('IVR_EXTENSIONS — שלמות המפה', () => {
  it('לכל שלוחה מזהה ייחודי', () => {
    const ids = IVR_EXTENSIONS.map(e => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('לכל שלוחה כותרת, מטרה ועץ לא ריק', () => {
    for (const e of IVR_EXTENSIONS) {
      expect(e.title, e.id).toBeTruthy()
      expect(e.purpose, e.id).toBeTruthy()
      expect(e.tree.length, e.id).toBeGreaterThan(0)
    }
  })

  it('⚠️ מזהי הצמתים ייחודיים בתוך כל שלוחה — הם מפתחות React', () => {
    for (const e of IVR_EXTENSIONS) {
      const ids: string[] = []
      const walk = (nodes: typeof e.tree) => {
        for (const n of nodes) { ids.push(n.id); if (n.children) walk(n.children) }
      }
      walk(e.tree)
      expect(new Set(ids).size, e.id).toBe(ids.length)
    }
  })
})

describe('🔴 שיחות יוצאות מופרדות מהתפריט', () => {
  // ⚠️ ההבחנה הזו היא מה שקובע היכן המסלול מוצג. מסלול יוצא שמוצג בעץ
  // התפריט מתאר מסלול שאיש אינו עובר, ומי שמחפש "למה לא הגיע הקוד"
  // מחפש במקום הלא נכון.
  it('קוד האימות והודעת האישור מסומנים כיוצאים', () => {
    const outbound = IVR_EXTENSIONS.filter(e => e.outbound).map(e => e.id)
    expect(outbound).toContain('otp')
    expect(outbound).toContain('announce')
  })

  it('🔴 שלוחות התפריט אינן מסומנות כיוצאות', () => {
    for (const id of ['menu', 'holiday', 'maternity']) {
      const e = IVR_EXTENSIONS.find(x => x.id === id)
      expect(e, id).toBeTruthy()
      expect(e!.outbound, id).toBeFalsy()
    }
  })

  it('⚠️ להודעת האישור אין webhook — ימות מנגנת קובץ ולא פונה אלינו', () => {
    const announce = IVR_EXTENSIONS.find(e => e.id === 'announce')!
    expect(announce.webhook).toBe('—')
    expect(announce.env).toContain('YEMOT_ANNOUNCE_TEMPLATE_ID')
  })
})

describe('🔴 מספר ההקשה לכל שלוחה', () => {
  // ⚠️ המספר הוא מה שהמנהל מחפש כשהוא רוצה לדעת "איך מגיעים לשם".
  // הוא חייב להתאים ל-DIGIT_TO_ROUTE ב-lib/ivrDelegate — אחרת המסך
  // מבטיח מקש אחד והשלוחה עונה לאחר.
  it('חגים 1, יולדות 2', () => {
    expect(IVR_EXTENSIONS.find(e => e.id === 'holiday')?.digit).toBe('1')
    expect(IVR_EXTENSIONS.find(e => e.id === 'maternity')?.digit).toBe('2')
  })

  it('⚠️ לתפריט הראשי אין מקש — מגיעים אליו בחיוג', () => {
    expect(IVR_EXTENSIONS.find(e => e.id === 'menu')?.digit).toBeUndefined()
  })

  it('⚠️ לשיחות יוצאות אין מקש — לא מקישים אליהן כלל', () => {
    for (const e of IVR_EXTENSIONS.filter(x => x.outbound)) {
      expect(e.digit, e.id).toBeUndefined()
    }
  })
})

describe('שלוחות שיש להן הודעות לעריכה', () => {
  it('חגים ויולדות מקושרות לרשימות ההודעות', () => {
    expect(IVR_EXTENSIONS.find(e => e.id === 'holiday')?.messagesKey).toBe('holiday')
    expect(IVR_EXTENSIONS.find(e => e.id === 'maternity')?.messagesKey).toBe('maternity')
  })
})
