import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// זיכרון העוזר.
//
// המודל עצמו אינו ניתן לאימון מהצד שלנו — אבל אפשר לתת לו זיכרון מצטבר
// שנשלח לו בכל שיחה. בפועל זו למידה: ככל שהצוות שואל יותר, ההנחיה שלו
// נעשית מדויקת יותר לשפה ולצרכים שלהם.
//
// שני מקורות:
//   1. אוטומטי — שאלות חוזרות שהצליחו. הן מלמדות את הניסוחים והמונחים
//      של הצוות ("תיק" במקום "בקשה"), כך שהוא יבין אותם בפעם הבאה.
//   2. ידני — ידע שהמנהל הוסיף אחרי שראה שאלה שנכשלה.
// ─────────────────────────────────────────────────────────────────────────────

export type Outcome = 'ok' | 'no_data' | 'refused' | 'error'

/** רושם שאלה ותוצאתה. לעולם לא זורק — רישום לא יפיל שיחה. */
export async function logQuestion(
  db: SupabaseClient,
  entry: {
    userId: string
    userName: string
    question: string
    answer: string
    toolsUsed: string[]
    outcome: Outcome
  },
): Promise<void> {
  try {
    await db.from('assistant_log').insert({
      user_id: entry.userId,
      user_name: entry.userName,
      question: entry.question.slice(0, 1000),
      answer: entry.answer.slice(0, 2000),
      tools_used: entry.toolsUsed,
      outcome: entry.outcome,
    })
  } catch (e) {
    console.error('[assistant/memory] רישום נכשל:', e)
  }
}

/**
 * הזיכרון שנשלח להנחיה. מורכב מהידע הידני ומהשאלות הנפוצות של הצוות.
 * מוגבל בגודל — הנחיה נפוחה פוגעת באיכות ומייקרת כל שיחה.
 */
export async function buildMemory(db: SupabaseClient): Promise<string> {
  const parts: string[] = []

  try {
    // ── ידע שהמנהל הוסיף ──
    const { data: knowledge } = await db
      .from('assistant_knowledge')
      .select('content')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(30)

    if (knowledge?.length) {
      parts.push(
        '## ידע שנצבר על המערכת הזו\n' +
        knowledge.map(k => `• ${k.content}`).join('\n'),
      )
    }

    // ── שאלות נפוצות שהצליחו ──
    // הן מלמדות את הניסוחים והמונחים של הצוות. מציגים רק כאלה שחזרו,
    // כדי לא להציף את ההנחיה בשאלות אקראיות.
    const since = new Date(Date.now() - 60 * 86400000).toISOString()
    const { data: recent } = await db
      .from('assistant_log')
      .select('question')
      .eq('outcome', 'ok')
      .gte('created_at', since)
      .limit(300)

    if (recent?.length) {
      const counts = new Map<string, number>()
      for (const r of recent) {
        const q = String(r.question ?? '').trim().toLowerCase()
        if (q.length < 5) continue
        counts.set(q, (counts.get(q) ?? 0) + 1)
      }

      const common = [...counts.entries()]
        .filter(([, n]) => n >= 2)              // חזרה לפחות פעמיים
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([q]) => q)

      if (common.length) {
        parts.push(
          '## שאלות שהצוות שואל לעיתים קרובות\n' +
          'אלה הניסוחים והמונחים שבהם הם משתמשים. הכר אותם וענה עליהם מהר:\n' +
          common.map(q => `• ${q}`).join('\n'),
        )
      }
    }
  } catch (e) {
    // כשל בזיכרון לא מפיל את העוזר — הוא פשוט יעבוד בלעדיו
    console.error('[assistant/memory] בניית הזיכרון נכשלה:', e)
  }

  return parts.join('\n\n')
}

/** מסיק את התוצאה מהתשובה — כדי לדעת מה נכשל ולהציג למנהל. */
export function classifyOutcome(answer: string, toolsUsed: string[]): Outcome {
  const a = answer.trim()
  if (!a) return 'error'

  // סירוב (שאלה שאינה על המערכת)
  if (/אני יכול לעזור רק בשאלות על מערכת הניהול/.test(a)) return 'refused'

  // לא נמצא נתון — כולל המקרה שבו הוא לא הפעיל שום כלי בשאלה שדרשה נתונים
  if (/אין לי (גישה|את הנתון|מידע)|לא נמצא|לא מצאתי|אין לי דרך/.test(a)) return 'no_data'
  if (!toolsUsed.length && /לא (יכול|הצלחתי)/.test(a)) return 'no_data'

  return 'ok'
}
