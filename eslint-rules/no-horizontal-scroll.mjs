/**
 * ═══════════════════════════════════════════════════════════════════════════
 * כלל מוחלט: אין גלילה לרוחב בשום מקום במערכת.
 *
 * 🔴 למה זה כלל לינט ולא רק הנחיה בתיעוד: ההנחיה קיימת מזמן ונשברה שוב ושוב.
 * הערה בקובץ אפשר לא לראות; כלל לינט אי אפשר לשכוח — הבנייה נכשלת.
 *
 * גלילה לרוחב = עמודות שנחתכות ולא נראות. "פעולות" ו"תאריך" בקצה הטבלה פשוט
 * נעלמים, והמשתמש אינו יודע שהם שם. גם גלילה *בתוך* הכרטיס פסולה — היא עדיין
 * גלילה, והתוצאה למשתמש זהה.
 *
 * מה כן עושים במקום (ראה docs/no-horizontal-scroll.md):
 *   • להסתיר עמודות לפי רוחב מסך — hidden xl:table-cell
 *   • לאחד עמודות — ראשי + משני קטן מתחתיו בתא אחד
 *   • כרטיסים בנייד במקום טבלה
 *   • truncate + title לערכים ארוכים
 *   • flex-1 + min-w-0 לגרפים · flex-wrap לסרגלי ניווט · <select> לרשימות ארוכות
 *
 * ⚠️ מה הכלל *אינו* אוסר, במכוון:
 *   • overflow-auto / overflow-y-auto — גלילה אנכית לגיטימית (מודאלים, <pre>)
 *   • min-w קטן על שדה חיפוש עם flex-1 — יש לו מקום להתכווץ בפועל
 * הכלל מכוון לגלישה *אופקית* בלבד, ולרוחב מינימלי שכופה אותה בתוך טבלה.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// גלילה אופקית מפורשת — תמיד אסורה.
const BANNED_X = /\boverflow-x-(auto|scroll)\b/

// רוחב מינימלי שכופה גלישה. רק ≥260px נחשב — מתחת לזה נכנס גם במסך צר.
// ⚠️ נבדק רק כשאין flex-1/flex-auto באותו class: עם flex-1 הרכיב מתכווץ
// בפועל, וה-min-w הוא רצפה סבירה לשדה חיפוש ולא כפייה של גלישה.
const WIDE_MIN_W = /\bmin-w-\[(\d{3,})px\]/
const CAN_SHRINK = /\bflex-(1|auto)\b/

export default {
  meta: {
    type: 'problem',
    docs: { description: 'אוסר גלילה לרוחב — הכל חייב להיכנס למסך' },
    schema: [],
    messages: {
      noScroll:
        '🔴 אין גלילה לרוחב במערכת. "{{cls}}" חותך עמודות שהמשתמש לא יראה. ' +
        'במקום: להסתיר עמודות (hidden xl:table-cell), לאחד עמודות, כרטיסים בנייד, ' +
        'או flex-1+min-w-0. ראה docs/no-horizontal-scroll.md',
      wideMinW:
        '⚠️ "{{cls}}" כופה רוחב מינימלי גדול ללא flex-1 — כך נוצרת גלישה לרוחב ' +
        'במסך צר, גם בלי overflow-x מפורש. ראה docs/no-horizontal-scroll.md',
    },
  },

  create(context) {
    function check(node, value) {
      if (typeof value !== 'string') return
      const banned = value.match(BANNED_X)
      if (banned) {
        context.report({ node, messageId: 'noScroll', data: { cls: banned[0] } })
      }
      const wide = value.match(WIDE_MIN_W)
      if (wide && Number(wide[1]) >= 260 && !CAN_SHRINK.test(value)) {
        context.report({ node, messageId: 'wideMinW', data: { cls: wide[0] } })
      }
    }

    /** שולף מחרוזות מ-className, כולל תבניות ותנאים מקוננים. */
    function walk(node) {
      if (!node) return
      switch (node.type) {
        case 'Literal':
          return check(node, node.value)
        case 'TemplateLiteral':
          // גם החלקים הקבועים וגם הביטויים בתוך ${...} — התבנית
          // `p-2 ${on ? 'overflow-x-scroll' : ''}` היא דפוס נפוץ כאן,
          // ובלי המעבר על expressions היא הייתה חומקת מהכלל.
          node.quasis.forEach(q => check(node, q.value.cooked))
          return node.expressions.forEach(walk)
        case 'ConditionalExpression':
          walk(node.consequent); return walk(node.alternate)
        case 'LogicalExpression':
        case 'BinaryExpression':
          walk(node.left); return walk(node.right)
        case 'JSXExpressionContainer':
          return walk(node.expression)
      }
    }

    return {
      JSXAttribute(node) {
        if (node.name?.name !== 'className' && node.name?.name !== 'class') return
        walk(node.value)
      },
    }
  },
}
