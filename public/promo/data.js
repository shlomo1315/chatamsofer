/*
  נתוני האתר: סיכומים מצטברים בלבד (בלי שמות, ת.ז., טלפונים או כתובות).
  כדי לעדכן: להריץ את stats.sql ולהחליף את הערכים כאן.
  sample: true = מספרים זמניים עד לעדכון.
*/
window.SITE_DATA = {
  sample: true,
  asOf: '2026-11-15',
  beneficiaries: {
    total: 612,
    by_status: { approved: 498, pending: 57, review: 41, rejected: 16 },
    children_total: 3412,
    by_month: { '2026-06': 38, '2026-07': 44, '2026-08': 29, '2026-09': 52, '2026-10': 61, '2026-11': 23 }
  },
  families: 540,
  documents: { total: 1840, verified: 1622 },
  lineage: {
    nodes: 1263, verified: 1108, pending: 155, generations: 9,
    by_generation: { 0: 1, 1: 5, 2: 21, 3: 64, 4: 158, 5: 301, 6: 388, 7: 252, 8: 73 },
    top_names: [
      { g: 0, name: 'רבי משה סופר · החתם סופר' },
      { g: 1, name: 'רבי אברהם שמואל בנימין סופר · כתב סופר' },
      { g: 1, name: 'רבי שמעון סופר' }
    ]
  },
  maternity: {
    total: 186,
    by_status: { active: 14, pending: 6, completed: 162, cancelled: 4 },
    by_card_status: { loaded: 14, unloaded: 158, idle: 10, failed: 2, pending: 2 },
    card_balance_total: 16800,
    card_loaded_total: 221400
  },
  recovery_homes: 5,
  loans: {
    total: 214,
    by_status: { active: 73, approved: 9, pending: 12, completed: 104, rejected: 11, defaulted: 5 },
    amount_total: 3120000, amount_active: 1148000, avg_amount: 14600, avg_installments: 24,
    by_month: { '2026-06': 14, '2026-07': 9, '2026-08': 11, '2026-09': 17, '2026-10': 21, '2026-11': 8 }
  },
  distributions: [
    { name: 'חלוקת חנוכה תשפ״ז', holiday: 'חנוכה', status: 'planning', budget: 90000, recipients: 0, received: 0 },
    { name: 'חלוקת סוכות תשפ״ז', holiday: 'סוכות', status: 'completed', budget: 120000, recipients: 412, received: 398 },
    { name: 'חלוקת פסח תשפ״ו', holiday: 'פסח', status: 'completed', budget: 180000, recipients: 455, received: 449 }
  ],
  staff: { admin: 2, secretary: 3, reviewer: 2, collections: 1 },
  activity_log: 9840
};
