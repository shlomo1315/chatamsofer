/* היכל החתם סופר · אתר תדמית */
(() => {
'use strict';

const D = window.SITE_DATA;
const STATS_API = 'https://chasamsofer.info/api/public-stats';
const BEAT = 500;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const fmt = n => Math.round(n).toLocaleString('he-IL');
const cur = n => '₪' + Math.round(n).toLocaleString('he-IL');
const sum = o => Object.values(o || {}).reduce((a, b) => a + (+b || 0), 0);

/* ---------- seeded randomness for demo rows (no real identities in this file) ---------- */
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const LET = 'אבגדהוזחטיכלמנסעפצקרשת';
function fake(r, min = 3, max = 6) { let s = ''; const n = min + Math.floor(r() * (max - min + 1)); for (let i = 0; i < n; i++) s += LET[Math.floor(r() * LET.length)]; return s; }
function fakeName(r) { return fake(r, 3, 5) + ' ' + fake(r, 4, 6); }
function digits(r, n) { let s = ''; for (let i = 0; i < n; i++) s += Math.floor(r() * 10); return s; }
const RD = t => `<span class="rd" aria-label="מוסתר">${t}</span>`;
function allocate(counts, n) {
  const total = sum(counts) || 1, keys = Object.keys(counts);
  const raw = keys.map(k => ({ k, v: counts[k] / total * n }));
  const out = raw.map(x => ({ k: x.k, c: Math.floor(x.v), f: x.v - Math.floor(x.v) }));
  let left = n - out.reduce((a, b) => a + b.c, 0);
  out.slice().sort((a, b) => b.f - a.f).forEach(x => { if (left > 0 && counts[x.k] > 0) { x.c++; left--; } });
  out.forEach(x => { if (x.c === 0 && counts[x.k] > 0 && n >= keys.length) x.c = 1; });
  const list = []; out.forEach(x => { for (let i = 0; i < x.c; i++) list.push(x.k); });
  return list.slice(0, n);
}
function shuffle(a, r) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ---------- icons ---------- */
const P = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  tree: '<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  chart: '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
  settings: '<line x1="21" y1="4" x2="14" y2="4"/><line x1="10" y1="4" x2="3" y2="4"/><line x1="21" y1="12" x2="12" y2="12"/><line x1="8" y1="12" x2="3" y2="12"/><line x1="21" y1="20" x2="16" y2="20"/><line x1="12" y1="20" x2="3" y2="20"/><line x1="14" y1="2" x2="14" y2="6"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="16" y1="18" x2="16" y2="22"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  trend: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  chev: '<polyline points="15 18 9 12 15 6"/>',
  undo: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><polyline points="3 3 3 8 8 8"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  arrow: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>'
};
const ic = n => `<svg class="ic" viewBox="0 0 24 24">${P[n]}</svg>`;

/* ---------- Hebrew date (gematria) and halachic times for Jerusalem ---------- */
function gem(n) {
  const o = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'], t = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'], h = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];
  let s = h[Math.floor(n / 100)] || ''; const tt = Math.floor(n % 100 / 10), oo = n % 10;
  if (tt === 1 && oo === 5) s += 'טו'; else if (tt === 1 && oo === 6) s += 'טז'; else s += t[tt] + o[oo];
  return s.length === 1 ? s + '׳' : s.slice(0, -1) + '״' + s.slice(-1);
}
function hebDate(d) {
  try {
    const parts = new Intl.DateTimeFormat('he-u-ca-hebrew', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jerusalem' }).formatToParts(d);
    const g = k => (parts.find(p => p.type === k) || {}).value || '';
    const day = parseInt(g('day'), 10), yr = parseInt(g('year'), 10);
    const m = g('month');
    return `${isNaN(day) ? g('day') : gem(day)} ב${m} ${isNaN(yr) ? g('year') : gem(yr % 1000)}`;
  } catch (e) { return ''; }
}
function jlmYMD(d) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).split('-').map(Number); }
function solar(y, m, d, zenith, rising) {
  const lat = 31.778, lng = 35.235, rad = Math.PI / 180;
  const N = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 864e5);
  const lh = lng / 15, t = N + ((rising ? 6 : 18) - lh) / 24, M = 0.9856 * t - 3.289;
  let L = (M + 1.916 * Math.sin(M * rad) + 0.020 * Math.sin(2 * M * rad) + 282.634) % 360; if (L < 0) L += 360;
  let RA = Math.atan(0.91764 * Math.tan(L * rad)) / rad; RA = (RA % 360 + 360) % 360;
  RA = (RA + Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90) / 15;
  const sd = 0.39782 * Math.sin(L * rad), cd = Math.cos(Math.asin(sd));
  const cosH = (Math.cos(zenith * rad) - sd * Math.sin(lat * rad)) / (cd * Math.cos(lat * rad));
  if (cosH > 1 || cosH < -1) return null;
  const H = (rising ? 360 - Math.acos(cosH) / rad : Math.acos(cosH) / rad) / 15;
  const UT = ((H + RA - 0.06571 * t - 6.622 - lh) % 24 + 24) % 24;
  return Date.UTC(y, m - 1, d) + UT * 36e5;
}
function zmanim(date) {
  const [y, m, d] = jlmYMD(date);
  const ne = solar(y, m, d, 90.833, true), sh = solar(y, m, d, 90.833, false);
  const al = solar(y, m, d, 106.1, true), tz = solar(y, m, d, 98.5, false);
  if (!ne || !sh) return [];
  const hr = (sh - ne) / 12;
  return [['עלות השחר', al], ['הנץ החמה', ne], ['סוף זמן ק״ש (גר״א)', ne + 3 * hr], ['סוף זמן תפילה', ne + 4 * hr], ['חצות היום', ne + 6 * hr],
    ['מנחה גדולה', ne + 6.5 * hr], ['מנחה קטנה', ne + 9.5 * hr], ['פלג המנחה', ne + 10.75 * hr], ['שקיעה', sh], ['צאת הכוכבים', tz]].filter(z => z[1]);
}
function remaining(ms) {
  const tm = Math.max(0, Math.floor(ms / 60000)), h = Math.floor(tm / 60), m = tm % 60;
  if (!h && !m) return 'בעוד פחות מדקה';
  const hp = h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : h > 2 ? `${h} שעות` : '';
  const mp = m === 1 ? 'דקה' : m > 0 ? `${m} דקות` : '';
  return 'בעוד ' + [hp, mp].filter(Boolean).join(' ו־');
}
const tfmt = (ms, sec) => new Date(ms).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: sec ? '2-digit' : undefined, timeZone: 'Asia/Jerusalem' });
function tickClock() {
  const now = new Date();
  const heb = hebDate(now);
  const all = [...zmanim(now), ...zmanim(new Date(now.getTime() + 864e5))];
  const nz = all.find(z => z[1] > now.getTime());
  $('#zTime').textContent = tfmt(now.getTime(), true);
  $('#zHeb').textContent = heb + ' · ' + now.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });
  $('#zNext').innerHTML = nz ? `${nz[0]} <b class="num">${tfmt(nz[1])}</b> (${remaining(nz[1] - now)}) · ירושלים` : '';
  const ht = $('#hdTime'); if (ht) ht.textContent = tfmt(now.getTime(), true);
  const hh = $('#hdHeb'); if (hh) hh.textContent = heb;
}

/* ---------- derived demo data ---------- */
let M; // model
function buildModel() {
  const r = rng(5787);
  const g1 = (D.lineage.top_names || []).filter(n => n.g === 1).map(n => n.name);
  const short = s => (s.split('·')[1] || s).trim();
  const branches = g1.length ? g1.map(short) : ['ענף א׳'];
  const ben = shuffle(allocate(D.beneficiaries.by_status, 14), r).map((st, i) => ({
    id: i, name: fakeName(r), tz: digits(r, 9), city: fake(r, 4, 7), phone: '05' + digits(r, 8),
    kids: 1 + Math.floor(r() * 10), branch: branches[Math.floor(r() * branches.length)], status: st,
    docs: Math.floor(r() * 4), mid: [fake(r, 4, 6), fake(r, 4, 6)]
  }));
  const mstat = allocate(Object.fromEntries(['active', 'pending', 'completed', 'cancelled'].map(k => [k, D.maternity.by_status[k] || 0])), 8);
  const mat = shuffle(mstat, r).map((st, i) => {
    const days = st === 'active' ? 3 + Math.floor(r() * 34) : st === 'pending' ? Math.floor(r() * 4) : 50 + Math.floor(r() * 200);
    return { id: i, fam: fake(r, 4, 6), days, home: 'בית החלמה ' + 'אבגדה'[Math.floor(r() * Math.min(5, D.recovery_homes || 5))] + '׳',
      status: st, card: st === 'active' ? 'loaded' : st === 'pending' ? 'idle' : 'unloaded', bal: st === 'active' ? 400 + Math.round(r() * 8) * 100 : 0, cardNo: digits(r, 4) };
  });
  const purposes = ['נישואין', 'דיור', 'פרנסה', 'הוצאות רפואיות', 'סגירת חובות', 'לימודים'];
  const lstat = allocate(D.loans.by_status, 10);
  const loans = shuffle(lstat, r).map((st, i) => {
    const amount = Math.max(1000, Math.min(30000, Math.round((D.loans.avg_amount * (.4 + r() * 1.2)) / 500) * 500));
    const inst = [12, 18, 24, 30, 36][Math.floor(r() * 5)];
    return { id: i, name: fakeName(r), amount, inst, purpose: purposes[Math.floor(r() * purposes.length)], status: st, paid: st === 'completed' ? inst : st === 'active' || st === 'defaulted' ? Math.floor(r() * inst) : 0 };
  });
  const dists = (D.distributions || []).map((d, i) => {
    const n = Math.min(12, Math.max(6, d.recipients ? 12 : 8));
    const recRatio = d.recipients ? d.received / d.recipients : 0;
    const rec = Array.from({ length: n }, () => ({ fam: fake(r, 4, 6), status: d.status === 'planning' ? 'pending' : r() < recRatio ? 'received' : (r() < .5 ? 'pending' : 'not_received') }));
    return { ...d, id: i, sample: rec, delta: 0 };
  });
  const roles = { admin: 'מנהל', secretary: 'מזכירות', reviewer: 'בודק', collections: 'גבייה' };
  const users = [];
  Object.entries(D.staff || {}).forEach(([role, c]) => { for (let i = 0; i < c; i++) users.push({ id: users.length, name: fakeName(r), mail: fake(r, 5, 7), role, perms: defaultPerms(role) }); });
  // lineage tree: real top generations, redacted below
  let nid = 0;
  const pending = D.lineage.nodes ? D.lineage.pending / D.lineage.nodes : .1;
  const node = (name, gen, real) => ({ id: nid++, name, gen, real, status: real || r() > pending ? 'verified' : 'pending', kids: [], open: gen < 2 });
  const root = node((D.lineage.top_names.find(n => n.g === 0) || { name: 'החתם סופר' }).name, 0, true);
  g1.forEach(nm => {
    const c = node(nm, 1, true); root.kids.push(c);
    for (let i = 0; i < 2 + Math.floor(r() * 2); i++) {
      const g2 = node(fake(r, 4, 6) + ' ' + fake(r, 3, 5), 2, false); c.kids.push(g2);
      for (let j = 0; j < 1 + Math.floor(r() * 3); j++) {
        const g3 = node(fake(r, 4, 6) + ' ' + fake(r, 3, 5), 3, false); g2.kids.push(g3);
        for (let k = 0; k < Math.floor(r() * 3); k++) g3.kids.push(node(fake(r, 4, 6) + ' ' + fake(r, 3, 5), 4, false));
      }
    }
  });
  M = { ben, mat, loans, dists, users, roles, root, nid, branches, matSel: mat.findIndex(m => m.status === 'active'), loanSel: 0, distSel: dists.findIndex(d => d.status !== 'completed'), userSel: 0,
        benSel: null, benFilter: 'all', benQ: '', calc: { amount: 15000, inst: 24 }, addAt: null };
  if (M.matSel < 0) M.matSel = 0; if (M.distSel < 0) M.distSel = 0;
}
function defaultPerms(role) {
  const S = ['beneficiaries', 'lineage', 'maternity', 'loans', 'distributions', 'reports'];
  const map = { admin: 'add', secretary: 'edit', reviewer: 'view', collections: 'none' };
  const p = {}; S.forEach(s => p[s] = map[role] || 'view');
  if (role === 'collections') { p.loans = 'edit'; p.reports = 'view'; }
  if (role === 'reviewer') { p.lineage = 'edit'; p.beneficiaries = 'edit'; }
  return p;
}

const STATUS = {
  approved: 'מאושר', pending: 'ממתין', review: 'בבדיקה', rejected: 'נדחה', active: 'פעיל', completed: 'הושלם', defaulted: 'בפיגור', cancelled: 'בוטל',
  planning: 'בתכנון', loaded: 'נטען', idle: 'לא נטען', unloaded: 'נפרק', failed: 'נכשל', received: 'התקבל', not_received: 'לא התקבל', verified: 'מאומת'
};
const pill = s => `<span class="pill st-${s}">${STATUS[s] || s}</span>`;

/* ---------- charts ---------- */
const C1 = '#4f46e5', C2 = '#c08a1e';
function monthKeys() {
  const ks = new Set([...Object.keys(D.beneficiaries.by_month || {}), ...Object.keys(D.loans.by_month || {})]);
  return [...ks].sort().slice(-6);
}
const mLabel = k => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 2).toLocaleDateString('he-IL', { month: 'short' }); };
function barChart() {
  const ks = monthKeys(), A = ks.map(k => +(D.beneficiaries.by_month[k] || 0)), B = ks.map(k => +(D.loans.by_month[k] || 0));
  const W = 560, H = 210, pl = 34, pb = 26, pt = 10, ih = H - pb - pt, iw = W - pl - 6;
  const max = Math.max(4, ...A, ...B), step = Math.pow(10, Math.floor(Math.log10(max))) * (max / Math.pow(10, Math.floor(Math.log10(max))) > 5 ? 2 : 1);
  const top = Math.ceil(max / step) * step;
  const y = v => pt + ih - v / top * ih;
  const gw = iw / ks.length, bw = Math.min(22, gw / 3.2);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="רישומים חדשים לפי חודש">`;
  for (let v = 0; v <= top; v += step) s += `<line x1="${pl}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="#eef2f7"/><text x="${pl - 6}" y="${y(v) + 4}" font-size="10" fill="#94a3b8" text-anchor="end">${v}</text>`;
  const bar = (x, v, c) => { const h = Math.max(0, y(0) - y(v)), r = Math.min(4, h); return h ? `<path d="M${x},${y(0)} v${-(h - r)} q0,${-r} ${r},${-r} h${bw - 2 * r} q${r},0 ${r},${r} v${h - r} z" fill="${c}"/>` : ''; };
  ks.forEach((k, i) => {
    const cx = pl + gw * i + gw / 2;
    s += `<g data-tip="${mLabel(k)} · נתמכים חדשים ${A[i]} · הלוואות ${B[i]}"><rect x="${cx - gw / 2}" y="${pt}" width="${gw}" height="${ih}" fill="transparent"/>` +
      bar(cx - bw - 1, A[i], C1) + bar(cx + 1, B[i], C2) + `</g><text x="${cx}" y="${H - 8}" font-size="11" fill="#64748b" text-anchor="middle">${mLabel(k)}</text>`;
  });
  const li = ks.length - 1, lx = pl + gw * li + gw / 2;
  s += `<text x="${lx - bw / 2 - 1}" y="${y(A[li]) - 5}" font-size="10" fill="#334155" text-anchor="middle" font-weight="600">${A[li]}</text>`;
  s += `<text x="${lx + bw / 2 + 1}" y="${y(B[li]) - 5}" font-size="10" fill="#334155" text-anchor="middle" font-weight="600">${B[li]}</text>`;
  return s + '</svg>';
}
function donut(entries, center) {
  const tot = entries.reduce((a, e) => a + e.v, 0) || 1, R = 62, w = 20, c = 2 * Math.PI * R;
  let off = 0, s = `<svg viewBox="0 0 170 170" role="img" aria-label="${center}"><g transform="rotate(-90 85 85)">`;
  entries.forEach(e => {
    const len = e.v / tot * c, gap = entries.length > 1 && e.v ? 2 : 0;
    s += `<circle cx="85" cy="85" r="${R}" fill="none" stroke="${e.c}" stroke-width="${w}" stroke-dasharray="${Math.max(0, len - gap)} ${c}" stroke-dashoffset="${-off}" data-tip="${e.l}: ${fmt(e.v)} (${Math.round(e.v / tot * 100)}%)"/>`;
    off += len;
  });
  return s + `</g><text x="85" y="82" text-anchor="middle" font-size="24" font-weight="700" fill="#0f172a">${fmt(tot)}</text><text x="85" y="102" text-anchor="middle" font-size="11" fill="#64748b">${center}</text></svg>`;
}
function hbars(entries) {
  const max = Math.max(1, ...entries.map(e => e.v));
  return `<div class="bars">${entries.map(e => `<div class="bar-row"><div class="lbl"><span><i class="dot" style="background:${e.c}"></i>${e.l}</span><b class="num">${e.f ? e.f(e.v) : fmt(e.v)}</b></div><div class="track"><i style="width:${e.v / max * 100}%;background:${e.c}"></i></div></div>`).join('')}</div>`;
}
const SC = { approved: '#16a34a', pending: '#d97706', review: '#4f46e5', rejected: '#b91c1c', active: '#2563eb', completed: '#64748b', defaulted: '#b91c1c', cancelled: '#94a3b8', loaded: '#16a34a', unloaded: '#94a3b8', idle: '#cbd5e1', failed: '#b91c1c' };

/* ---------- app views ---------- */
const NAV = [['dashboard', 'לוח בקרה', 'dashboard'], ['beneficiaries', 'נתמכים', 'users'], ['lineage', 'עץ הדורות', 'tree'], ['maternity', 'יולדות', 'heart'],
  ['loans', 'הלוואות', 'card'], ['distributions', 'חלוקות', 'gift'], ['reports', 'דוחות', 'chart'], ['settings', 'הגדרות', 'settings']];
const V = {};

V.dashboard = () => {
  const b = D.beneficiaries, l = D.loans, m = D.maternity;
  const activeLoans = (l.by_status.active || 0) + (l.by_status.approved || 0);
  const planned = (D.distributions || []).filter(d => d.status === 'planning' || d.status === 'active').length;
  const tiles = [
    ['סה״כ נתמכים', fmt(b.total), `${fmt(b.by_status.approved || 0)} מאושרים`, 'users', 'g-ind', 'beneficiaries'],
    ['ממתינים לאישור', fmt((b.by_status.pending || 0) + (b.by_status.review || 0)), 'נתמכים', 'clock', 'g-amb', 'beneficiaries'],
    ['הלוואות פעילות', fmt(activeLoans), cur(l.amount_active), 'card', 'g-blu', 'loans'],
    ['תיקי יולדות פעילים', fmt(m.by_status.active || 0), `${fmt(m.by_status.pending || 0)} ממתינים`, 'heart', 'g-pnk', 'maternity'],
    ['חלוקות מתוכננות', fmt(planned), 'פעילות', 'gift', 'g-pur', 'distributions'],
    ['יתרת הלוואות', cur(l.amount_active), 'בפעילות', 'trend', 'g-grn', 'loans']];
  const sys = [['נתמכים מאושרים', b.by_status.approved || 0, b.total, '#22c55e'], ['ממתינים לאישור', b.by_status.pending || 0, b.total, '#f59e0b'],
    ['צמתים מאומתים בעץ', D.lineage.verified, D.lineage.nodes, '#6366f1'], ['מסמכים מאומתים', D.documents.verified, D.documents.total, '#a855f7']];
  return `<div class="banner"><div><h4>לוח בקרה</h4><p>סקירה כללית של פעילות העמותה · היכל החתם סופר</p></div><span class="chip-w">${hebDate(new Date())}</span></div>
  <div class="tiles">${tiles.map(t => `<button class="tile" data-go="${t[5]}"><span class="chipi ${t[4]}">${ic(t[3])}</span><span><b>${t[1]}</b><span class="t">${t[0]}</span> <span class="s">· ${t[2]}</span></span></button>`).join('')}</div>
  <div class="grid2"><div class="card chart"><h5>רישומים חדשים לפי חודש <span class="legend"><span><i class="dot" style="background:${C1}"></i>נתמכים</span><span><i class="dot" style="background:${C2}"></i>הלוואות</span></span></h5>${barChart()}</div>
  <div style="display:grid;gap:12px"><div class="card"><h5>פעולות מהירות</h5><div class="qa">
    <button class="qa-i" data-go="beneficiaries">רישום נתמך חדש ${ic('plus')}</button><button class="qa-p" data-go="maternity">פתיחת תיק יולדת ${ic('plus')}</button>
    <button class="qa-b" data-go="loans">בקשת הלוואה ${ic('plus')}</button><button class="qa-u" data-go="distributions">חלוקה חדשה ${ic('plus')}</button></div></div>
  <div class="card"><h5>סיכום מצב מערכת</h5><div class="bars">${sys.map(s => `<div class="bar-row"><div class="lbl"><span><i class="dot" style="background:${s[3]}"></i>${s[0]}</span><span class="num"><b>${fmt(s[1])}</b> / ${fmt(s[2])}</span></div><div class="track"><i style="width:${s[2] ? s[1] / s[2] * 100 : 0}%;background:${s[3]}"></i></div></div>`).join('')}</div></div></div></div>`;
};

function benRows() {
  const q = M.benQ.trim();
  return M.ben.filter(b => (M.benFilter === 'all' || b.status === M.benFilter) && (!q || b.branch.includes(q) || STATUS[b.status].includes(q)));
}
function benTable() {
  const rows = benRows();
  if (!rows.length) return '<div class="empty">לא נמצאו נתמכים לפי הסינון</div>';
  return `<table class="tbl"><thead><tr><th>שם</th><th>ת.ז.</th><th>עיר</th><th>ילדים</th><th>ענף</th><th>מסמכים</th><th>סטטוס</th></tr></thead><tbody>${rows.map(b =>
    `<tr data-ben="${b.id}" class="${M.benSel === b.id ? 'sel' : ''}"><td>${RD(b.name)}</td><td class="num">${RD(b.tz)}</td><td>${RD(b.city)}</td><td class="num">${b.kids}</td><td>${b.branch}</td><td class="num">${b.docs}/3</td><td>${pill(b.status)}</td></tr>`).join('')}</tbody></table>`;
}
V.beneficiaries = () => {
  const bs = D.beneficiaries.by_status;
  const chips = [['all', 'הכל', D.beneficiaries.total], ['approved', 'מאושר', bs.approved], ['pending', 'ממתין', bs.pending], ['review', 'בבדיקה', bs.review], ['rejected', 'נדחה', bs.rejected]];
  return `<div class="toolbar"><label class="search">${ic('search')}<input id="benQ" placeholder="חיפוש לפי ענף או סטטוס…" value="${M.benQ}" aria-label="חיפוש נתמכים"></label>
  <div class="chips">${chips.map(c => `<button class="chip ${M.benFilter === c[0] ? 'on' : ''}" data-bf="${c[0]}">${c[1]}<span class="n">${fmt(c[2] || 0)}</span></button>`).join('')}</div></div>
  <div class="split"><div class="tbl-wrap" id="benTbl">${benTable()}</div><div id="benDrawer">${benDrawer()}</div></div>`;
};
function benDrawer() {
  const b = M.ben.find(x => x.id === M.benSel);
  if (!b) return `<div class="drawer"><div class="empty">${ic('users')}<br>בחרו נתמך מהטבלה כדי לראות את התיק המלא</div></div>`;
  const docs = ['ת.ז. הבעל', 'ת.ז. האישה', 'ת.ז. ילד'];
  const root = (D.lineage.top_names.find(n => n.g === 0) || { name: 'החתם סופר' }).name.split('·').pop().trim();
  return `<div class="drawer"><div style="display:flex;justify-content:space-between;align-items:start;gap:8px"><div><h6>${RD(b.name)}</h6><div class="meta">תיק נתמך · ${b.kids} ילדים</div></div>${pill(b.status)}</div>
  <dl class="kv"><dt>ת.ז.</dt><dd class="num">${RD(b.tz)}</dd><dt>טלפון</dt><dd class="num">${RD(b.phone)}</dd><dt>כתובת</dt><dd>${RD(b.city + ' ' + b.mid[0])}</dd><dt>ענף</dt><dd>${b.branch}</dd></dl>
  <div class="sect">ייחוס בעץ הדורות</div><div class="path"><span>${root}</span><em>›</em><span>${b.branch}</span><em>›</em><span>${RD(b.mid[0])}</span><em>›</em><span>${RD(b.mid[1])}</span></div>
  <div class="sect">מסמכים מצורפים</div><div class="docs">${docs.map((d, i) => `<span class="doc">${i < b.docs ? ic('check') : ic('file')}${d}</span>`).join('')}</div>
  <div class="actions"><button class="abtn ok" data-bs="approved">${ic('check')}אשר</button><button class="abtn" data-bs="review">העבר לבדיקה</button><button class="abtn bad" data-bs="rejected">${ic('x')}דחה</button></div></div>`;
}

function treeHTML(n, interactive) {
  const hasK = n.kids.length > 0;
  const name = n.real ? `<span class="nm">${n.name}</span>` : `<span class="nm">${n.mine ? n.name : RD(n.name)}</span>`;
  let s = `<li><div class="lnode ${n.fresh ? 'newn' : ''}"><button class="tg ${hasK ? '' : 'leaf'} ${n.open ? 'open' : ''}" data-tg="${n.id}" aria-label="פתיחה וסגירה">${ic('chev')}</button>${name}<span class="gen">דור ${n.gen}</span>
    <button class="vbtn pill st-${n.status}" data-vf="${n.id}" title="${n.status === 'verified' ? 'מאומת · לחצו להחזרה לממתין' : 'ממתין לאימות · לחצו לאישור'}">${n.status === 'verified' ? 'מאומת' : 'ממתין'}</button>
    ${interactive ? `<button class="add" data-add="${n.id}">${ic('plus')} צאצא</button>` : ''}</div>`;
  if (interactive && M.addAt === n.id) s += `<div class="addrow"><input id="addName" placeholder="שם הצאצא" aria-label="שם הצאצא"><button class="abtn pri" data-addok="${n.id}">הוסף</button><button class="abtn" data-addcancel>ביטול</button></div>`;
  if (hasK && (n.open || !interactive)) s += `<ul>${n.kids.map(k => treeHTML(k, interactive)).join('')}</ul>`;
  return s + '</li>';
}
function findNode(n, id) { if (n.id === id) return n; for (const k of n.kids) { const f = findNode(k, id); if (f) return f; } return null; }
V.lineage = (interactive = true) => {
  const L = D.lineage, gens = Object.entries(L.by_generation || {}).sort((a, b) => a[0] - b[0]);
  const mx = Math.max(1, ...gens.map(g => +g[1]));
  return `<div class="grid2"><div class="card"><h5>עץ הדורות <small>${fmt(L.nodes)} צמתים · ${fmt(L.generations)} דורות</small></h5><ul class="ltree">${treeHTML(M.root, interactive)}</ul></div>
  <div style="display:grid;gap:12px;align-content:start"><div class="card"><h5>צמתים לפי דור</h5><div class="genbars">${gens.map(g => `<div data-tip="דור ${g[0]}: ${fmt(g[1])} צמתים"><i style="height:${Math.max(3, g[1] / mx * 100)}%"></i>${g[0]}</div>`).join('')}</div></div>
  <div class="card"><h5>מצב אימות</h5>${hbars([{ l: 'מאומתים', v: L.verified, c: '#16a34a' }, { l: 'ממתינים לאימות', v: L.pending, c: '#d97706' }])}</div></div></div>`;
};

V.maternity = () => {
  const m = M.mat[M.matSel] || M.mat[0];
  const wk = Math.min(6, Math.floor(m.days / 7));
  return `<div class="split"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>משפחה</th><th>לפני</th><th>בית החלמה</th><th>כרטיס נדרים</th><th>סטטוס</th></tr></thead><tbody>${M.mat.map((x, i) =>
    `<tr data-mat="${i}" class="${i === M.matSel ? 'sel' : ''}"><td>${RD('משפ׳ ' + x.fam)}</td><td class="num">${x.days} ימים</td><td>${x.home}</td><td>${pill(x.card)}</td><td>${pill(x.status)}</td></tr>`).join('')}</tbody></table></div>
  <div class="drawer" id="matPanel"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h6>${RD('משפ׳ ' + m.fam)}</h6>${pill(m.status)}</div>
    <div class="ncard ${m.loading ? 'loading' : ''}"><div class="row"><span class="chipg"></span><span class="lbl">כרטיס נדרים · ${STATUS[m.card]}</span></div>
    <div class="lbl" style="margin-top:12px">יתרה בכרטיס</div><div class="bal num" id="balNum">${cur(m.bal)}</div><span class="no num">•••• ${RD(m.cardNo)}</span><span class="brandn">נדרים פלוס</span></div>
    <div class="sect">תקופת הזכאות: ${Math.min(wk + (m.status === 'active' ? 1 : 0), 6)} מתוך 6 שבועות</div>
    <div class="weeks">${Array.from({ length: 6 }, (_, i) => `<i class="${m.status === 'completed' || i < wk ? 'past' : i === wk && m.status === 'active' ? 'now' : ''}"></i>`).join('')}</div>
    <div class="meta" style="margin-top:6px">בתום 6 שבועות הכרטיס נפרק אוטומטית</div>
    ${m.status === 'pending' ? `<div class="actions"><button class="abtn ok" data-mact="approve">${ic('check')}אשר תיק</button></div>` : ''}
    ${m.status === 'active' || m.status === 'pending' ? `<div class="amt"><input id="loadAmt" type="number" min="100" step="100" value="1200" aria-label="סכום להטענה"><button class="abtn pri" data-mact="load" ${m.loading ? 'disabled' : ''}>${ic('zap')}הטען כרטיס</button></div>
      <ol class="steps" id="loadSteps">${['התחברות לנדרים פלוס', 'יצירה או עדכון משפחה', 'הטענת הסכום לכרטיס', 'רישום בתיק'].map((s, i) => `<li class="${m.step > i ? 'done' : m.step === i && m.loading ? 'doing' : ''}"><span class="b">${m.step > i ? '✓' : ''}</span>${s}</li>`).join('')}</ol>` : ''}
    ${m.card === 'loaded' && !m.loading ? `<div class="actions"><button class="abtn bad" data-mact="unload">פריקת כרטיס</button></div>` : ''}
  </div></div>`;
};

V.loans = () => {
  const l = M.loans[M.loanSel], c = M.calc, mon = c.amount / c.inst;
  return `<div class="split"><div style="display:grid;gap:12px"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>לווה</th><th>סכום</th><th>תשלומים</th><th>מטרה</th><th>שולם</th><th>סטטוס</th></tr></thead><tbody>${M.loans.map((x, i) =>
    `<tr data-loan="${i}" class="${i === M.loanSel ? 'sel' : ''}"><td>${RD(x.name)}</td><td class="num">${cur(x.amount)}</td><td class="num">${x.inst}</td><td>${x.purpose}</td><td class="num">${x.paid}/${x.inst}</td><td>${pill(x.status)}</td></tr>`).join('')}</tbody></table></div>
    <div class="card"><h5>סיכום הלוואות <small>${fmt(D.loans.total)} הלוואות במערכת</small></h5>${hbars(['active', 'approved', 'pending', 'completed', 'defaulted', 'rejected'].filter(k => D.loans.by_status[k]).map(k => ({ l: STATUS[k], v: D.loans.by_status[k], c: SC[k] || '#94a3b8' })))}</div></div>
  <div style="display:grid;gap:12px"><div class="drawer"><div style="display:flex;justify-content:space-between;align-items:center"><h6>${RD(l.name)}</h6>${pill(l.status)}</div>
    <dl class="kv"><dt>סכום</dt><dd class="num">${cur(l.amount)}</dd><dt>תשלומים</dt><dd class="num">${l.inst} × ${cur(l.amount / l.inst)}</dd><dt>מטרה</dt><dd>${l.purpose}</dd></dl>
    <div class="track"><i style="width:${l.paid / l.inst * 100}%;background:#4f46e5"></i></div>
    <div class="actions"><button class="abtn ok" data-ls="active">${ic('check')}אשר (זכאי)</button><button class="abtn bad" data-ls="rejected">דחה (לא זכאי)</button><button class="abtn" data-ls="pending">${ic('undo')}החזר לממתין</button></div></div>
  <div class="card calc"><h5>מחשבון גמ״ח <small>ללא ריבית</small></h5>
    <label for="cAmt">סכום מבוקש <b id="cAmtV">${cur(c.amount)}</b></label><input id="cAmt" type="range" min="1000" max="30000" step="500" value="${c.amount}">
    <label for="cInst">מספר תשלומים <b id="cInstV">${c.inst}</b></label><input id="cInst" type="range" min="6" max="48" step="1" value="${c.inst}">
    <div class="res"><small>החזר חודשי</small><b id="cMon">${cur(mon)}</b></div></div></div></div>`;
};

V.distributions = () => {
  const d = M.dists[M.distSel];
  const ringP = x => { const tot = x.recipients || x.sample.length; const rc = x.recipients ? x.received + x.delta : x.sample.filter(s => s.status === 'received').length; return [tot ? Math.round(rc / tot * 100) : 0, rc, tot]; };
  const [p, rc, tot] = d ? ringP(d) : [0, 0, 0];
  return `<div class="dists">${M.dists.map((x, i) => { const [pp] = ringP(x); return `<button class="dist ${i === M.distSel ? 'on' : ''}" data-dist="${i}"><span class="ring" style="--p:${pp}"><b>${pp}%</b></span><span><h6>${x.name}</h6><span class="m">${x.holiday || ''} · ${x.budget ? cur(x.budget) : 'ללא תקציב'}</span><br>${pill(x.status)}</span></button>`; }).join('')}</div>
  ${d ? `<div class="grid2"><div class="card"><h5>${d.name} <small class="num">${fmt(rc)} / ${fmt(tot)} התקבלו</small></h5><div class="recips">${d.sample.map((s, i) => `<div class="recip"><span>${RD('משפ׳ ' + s.fam)}</span><button class="vbtn pill st-${s.status}" style="border:0;cursor:pointer" data-rc="${i}">${STATUS[s.status]}</button></div>`).join('')}</div><div class="meta" style="margin-top:8px;font-size:12px;color:#64748b">לחיצה על סטטוס מסמנת מסירה. מוצגות 12 משפחות לדוגמה.</div></div>
  <div class="card"><h5>חלוקה חדשה</h5><form class="newdist" id="newDist" style="grid-template-columns:1fr 1fr"><label>שם החלוקה<input id="ndName" placeholder="חלוקת פורים תשפ״ז" required></label>
    <label>חג / אירוע<select id="ndHol"><option>פורים</option><option>פסח</option><option>ראש השנה</option><option>סוכות</option><option>חנוכה</option></select></label>
    <label>תקציב כולל (₪)<input id="ndBud" type="number" min="0" step="1000" value="50000"></label><button class="abtn pri" type="submit">${ic('plus')}צור חלוקה</button></form></div></div>` : ''}`;
};

V.reports = () => {
  const b = D.beneficiaries, l = D.loans, m = D.maternity;
  return `<div class="tiles">${[['סכום הלוואות כולל', cur(l.amount_total), 'trend', 'g-grn'], ['יתרה כוללת בכרטיסים', cur(m.card_balance_total), 'card', 'g-pnk'], ['הוטען בכרטיסים עד היום', cur(m.card_loaded_total), 'zap', 'g-amb']].map(t => `<div class="tile" style="cursor:default"><span class="chipi ${t[3]}">${ic(t[2])}</span><span><b>${t[1]}</b><span class="t">${t[0]}</span></span></div>`).join('')}</div>
  <div class="grid2e"><div class="card chart"><h5>נתמכים לפי סטטוס</h5><div style="display:grid;grid-template-columns:170px 1fr;gap:14px;align-items:center">${donut(['approved', 'pending', 'review', 'rejected'].map(k => ({ l: STATUS[k], v: b.by_status[k] || 0, c: SC[k] })), 'נתמכים')}
    <div class="bars">${['approved', 'pending', 'review', 'rejected'].map(k => `<div class="bar-row"><div class="lbl"><span><i class="dot" style="background:${SC[k]}"></i>${STATUS[k]}</span><span class="num"><b>${fmt(b.by_status[k] || 0)}</b> · ${Math.round((b.by_status[k] || 0) / (b.total || 1) * 100)}%</span></div></div>`).join('')}</div></div></div>
  <div class="card"><h5>כרטיסי נדרים לפי מצב</h5>${hbars(['loaded', 'unloaded', 'idle', 'failed'].filter(k => m.by_card_status[k]).map(k => ({ l: STATUS[k], v: m.by_card_status[k], c: SC[k] })))}
    <h5 style="margin-top:16px">הלוואות לפי מצב</h5>${hbars(['active', 'completed', 'pending', 'defaulted'].filter(k => l.by_status[k]).map(k => ({ l: STATUS[k], v: l.by_status[k], c: SC[k] })))}</div></div>`;
};

V.settings = () => {
  const u = M.users[M.userSel];
  const S = [['beneficiaries', 'נתמכים'], ['lineage', 'עץ הדורות'], ['maternity', 'יולדות'], ['loans', 'הלוואות'], ['distributions', 'חלוקות'], ['reports', 'דוחות']];
  const L = [['none', 'ללא'], ['view', 'צפייה'], ['edit', 'עריכה'], ['add', 'הוספה']];
  return `<div class="grid2e"><div class="card"><h5>משתמשי מערכת <small>${M.users.length} פעילים</small></h5><div class="users">${M.users.map((x, i) => `<button class="user ${i === M.userSel ? 'on' : ''}" data-user="${i}"><span class="av">${x.name[0]}</span><span>${RD(x.name)}<br><small class="num" style="color:#94a3b8">${RD(x.mail + '@chasamsofer.info')}</small></span><span class="role">${M.roles[x.role]}</span></button>`).join('')}</div>
    <form class="newdist" id="newUser" style="grid-template-columns:1fr 120px auto;margin-top:12px"><label>שם מלא<input id="nuName" placeholder="שם המשתמש" required></label><label>תפקיד<select id="nuRole">${Object.entries(M.roles).map(r => `<option value="${r[0]}">${r[1]}</option>`).join('')}</select></label><button class="abtn pri" type="submit">${ic('plus')}הוסף</button></form></div>
  <div class="card"><h5>הרשאות לפי מחלקה <small>${u ? M.roles[u.role] : ''}</small></h5>${u ? `<table class="perm"><thead><tr><th>מחלקה</th><th>רמת גישה</th></tr></thead><tbody>${S.map(s => `<tr><td>${s[1]}</td><td><span class="seg" role="group" aria-label="${s[1]}">${L.map(l => `<button class="${u.perms[s[0]] === l[0] ? 'on' : ''}" data-perm="${s[0]}:${l[0]}" ${u.role === 'admin' ? 'disabled' : ''}>${l[1]}</button>`).join('')}</span></td></tr>`).join('')}</tbody></table>
    <div class="meta" style="margin-top:10px;font-size:12px;color:#64748b">${u.role === 'admin' ? 'מנהל רואה ועורך הכל.' : 'מחלקה עם "ללא" נעלמת מהתפריט של המשתמש.'} סיסמה: לפחות 10 תווים.</div>` : ''}</div></div>`;
};

/* ---------- static screens for the 3D devices ---------- */
function appShell(view, inner) {
  return `<div class="app" style="height:100%"><aside class="app-side"><div class="app-brand"><span class="brand-badge sm"><img src="logo.png" alt=""></span><span><b>היכל החתם סופר</b><small>תוכנת ניהול</small></span></div>
  <nav class="app-nav">${NAV.map(n => `<button class="${n[0] === view ? 'on' : ''}" tabindex="-1">${ic(n[2])}${n[1]}</button>`).join('')}</nav><div class="app-ver">גרסה 1.0.0</div></aside>
  <div class="app-body"><div class="app-head"><h3>${NAV.find(n => n[0] === view)[1]}</h3><div class="app-head-end"><span class="hd-heb">${hebDate(new Date())}</span><span class="hd-user"><span class="av">ש</span><span><b>שלמה</b><small>מנהל</small></span></span></div></div>
  <main class="app-main" style="overflow:hidden">${inner}</main></div></div>`;
}
function portalScreen() {
  const act = M.mat.filter(m => m.status === 'active').slice(0, 4);
  return `<div class="portal"><div class="ph"><b>היכל החתם סופר</b><small>פורטל בית החלמה</small><br><span class="lock">${ic('lock')} כניסה מאובטחת</span></div>
  <div class="pl"><div class="ps">${ic('search')} חיפוש לפי שם או ת.ז.</div>${(act.length ? act : M.mat.slice(0, 3)).map(m => `<div class="pc"><b>${RD('משפ׳ ' + m.fam)}</b>${pill(m.status)}<div class="r"><span>מתאריך ${RD('12/11')}</span><span>עד תאריך ${RD('19/11')}</span></div></div>`).join('')}
  <div class="pc" style="text-align:center;color:#64748b;font-size:12px">${fmt(D.maternity.by_status.active || 0)} פעילים · ${fmt(D.recovery_homes || 0)} בתי החלמה</div></div></div>`;
}
function renderScreens() {
  $$('.screen').forEach(s => {
    const w = +s.dataset.w, h = +s.dataset.h, name = s.dataset.screen;
    const html = name === 'portal' ? portalScreen() : appShell(name, name === 'lineage' ? V.lineage(false) : V[name]());
    s.innerHTML = `<div class="scaler" style="width:${w}px;height:${h}px">${html}</div>`;
    const sc = s.querySelector('.scaler');
    const fit = () => { const k = s.clientWidth / w; sc.style.transform = `scale(${k})`; };
    fit();
  });
}

/* ---------- live app ---------- */
let view = 'dashboard';
const app = $('#app'), main = $('#appMain');
function renderNav() { $('#appNav').innerHTML = NAV.map(n => `<button class="${n[0] === view ? 'on' : ''}" data-go="${n[0]}">${ic(n[2])}${n[1]}</button>`).join(''); }
function render(anim) {
  main.innerHTML = view === 'lineage' ? V.lineage(true) : V[view]();
  $('#appTitle').textContent = NAV.find(n => n[0] === view)[1];
  $('#urlText').textContent = 'chasamsofer.info/admin/' + view;
  if (anim) { main.classList.remove('swap'); void main.offsetWidth; main.classList.add('swap'); }
}
function go(v) { view = v; renderNav(); render(true); main.scrollTop = 0; }
let toastT;
function toast(msg) { const t = $('#toast'); t.innerHTML = ic('check') + msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2400); }

app.addEventListener('click', e => {
  const el = e.target.closest('[data-go],[data-bf],[data-ben],[data-bs],[data-tg],[data-vf],[data-add],[data-addok],[data-addcancel],[data-mat],[data-mact],[data-loan],[data-ls],[data-dist],[data-rc],[data-user],[data-perm]');
  if (!el) return;
  const ds = el.dataset;
  if (ds.go) return go(ds.go);
  if (ds.bf) { M.benFilter = ds.bf; return render(); }
  if (ds.ben) { M.benSel = +ds.ben; $('#benDrawer').innerHTML = benDrawer(); $$('#benTbl tr').forEach(r => r.classList.toggle('sel', r.dataset.ben === ds.ben)); return; }
  if (ds.bs) { const b = M.ben.find(x => x.id === M.benSel); if (b) { b.status = ds.bs; render(); toast('הסטטוס עודכן ל' + STATUS[ds.bs]); } return; }
  if (ds.tg) { const n = findNode(M.root, +ds.tg); n.open = !n.open; return render(); }
  if (ds.vf) { const n = findNode(M.root, +ds.vf); n.status = n.status === 'verified' ? 'pending' : 'verified'; render(); return toast(n.status === 'verified' ? 'הצומת אומת' : 'הצומת הוחזר לממתין'); }
  if (ds.add) { M.addAt = +ds.add; render(); const i = $('#addName'); if (i) i.focus(); return; }
  if (ds.addcancel !== undefined) { M.addAt = null; return render(); }
  if (ds.addok) { const v = ($('#addName').value || '').trim(); if (!v) { $('#addName').focus(); return; } const p = findNode(M.root, +ds.addok); const n = { id: M.nid++, name: v, gen: p.gen + 1, real: false, mine: true, status: 'pending', kids: [], open: false, fresh: true }; p.kids.push(n); p.open = true; M.addAt = null; render(); n.fresh = false; return toast('נוסף צאצא לעץ · ממתין לאימות'); }
  if (ds.mat) { M.matSel = +ds.mat; return render(); }
  if (ds.mact) return matAction(ds.mact);
  if (ds.loan) { M.loanSel = +ds.loan; return render(); }
  if (ds.ls) { M.loans[M.loanSel].status = ds.ls; render(); return toast('ההלוואה עודכנה: ' + STATUS[ds.ls]); }
  if (ds.dist) { M.distSel = +ds.dist; return render(); }
  if (ds.rc) { const d = M.dists[M.distSel], s = d.sample[+ds.rc]; const order = ['pending', 'received', 'not_received']; const was = s.status; s.status = order[(order.indexOf(s.status) + 1) % 3]; if (d.recipients) d.delta += (s.status === 'received') - (was === 'received'); return render(); }
  if (ds.user) { M.userSel = +ds.user; return render(); }
  if (ds.perm) { const [sec, lv] = ds.perm.split(':'); M.users[M.userSel].perms[sec] = lv; render(); return toast('ההרשאה עודכנה'); }
});
app.addEventListener('input', e => {
  if (e.target.id === 'benQ') { M.benQ = e.target.value; $('#benTbl').innerHTML = benTable(); }
  if (e.target.id === 'cAmt' || e.target.id === 'cInst') {
    M.calc.amount = +$('#cAmt').value; M.calc.inst = +$('#cInst').value;
    $('#cAmtV').textContent = cur(M.calc.amount); $('#cInstV').textContent = M.calc.inst; $('#cMon').textContent = cur(M.calc.amount / M.calc.inst);
  }
});
app.addEventListener('keydown', e => { if (e.target.id === 'addName' && e.key === 'Enter') { const b = $('[data-addok]'); if (b) b.click(); } });
app.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.id === 'newDist') {
    const name = $('#ndName').value.trim(); if (!name) return;
    M.dists.unshift({ name, holiday: $('#ndHol').value, status: 'planning', budget: +$('#ndBud').value || 0, recipients: 0, received: 0, sample: [], delta: 0 });
    M.distSel = 0; render(); toast('החלוקה נוצרה · בתכנון');
  }
  if (e.target.id === 'newUser') {
    const name = $('#nuName').value.trim(); if (!name) return; const role = $('#nuRole').value;
    M.users.push({ id: M.users.length, name, mail: 'user', role, perms: defaultPerms(role) }); M.userSel = M.users.length - 1; render(); toast('המשתמש נוסף לרשימה');
  }
});
function matAction(a) {
  const m = M.mat[M.matSel];
  if (a === 'approve') { m.status = 'active'; render(); return toast('התיק אושר'); }
  if (a === 'unload') { m.card = 'unloaded'; m.bal = 0; m.status = 'completed'; render(); return toast('הכרטיס נפרק'); }
  if (a === 'load') {
    const amt = Math.max(100, +($('#loadAmt').value || 0));
    if (m.status === 'pending') m.status = 'active';
    m.loading = true; m.step = 0; render();
    const tick = () => {
      m.step++;
      if (m.step < 4) { if (view === 'maternity') render(); setTimeout(tick, 650); return; }
      const from = m.bal; m.bal += amt; m.card = 'loaded'; m.loading = false; m.step = 4;
      if (view === 'maternity') { render(); countUp($('#balNum'), from, m.bal, 900, cur); }
      toast(`הוטענו ${cur(amt)} לכרטיס`);
    };
    setTimeout(tick, 650);
  }
}
function countUp(el, a, b, dur, f = fmt) {
  if (!el) return; if (reduce) { el.textContent = f(b); return; }
  const t0 = performance.now();
  const step = t => { const k = clamp((t - t0) / dur); el.textContent = f(a + (b - a) * ease(k)); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

/* tooltips */
const tip = $('#tip');
document.addEventListener('pointermove', e => {
  const t = e.target.closest && e.target.closest('[data-tip]');
  if (!t) { tip.classList.remove('on'); return; }
  tip.textContent = t.dataset.tip; tip.classList.add('on');
  const w = tip.offsetWidth; tip.style.left = clamp(e.clientX - w / 2, 8, innerWidth - w - 8) + 'px'; tip.style.top = (e.clientY - 42) + 'px';
});

/* ---------- hero: kinetic intro on the beat ---------- */
const hero = $('#top');
$$('[data-beat]', hero).forEach(w => w.style.setProperty('--b', w.dataset.beat));
let introTimers = [];
function beatDot(i) { const ds = $$('.beat-dots i'); ds.forEach((d, j) => d.classList.toggle('on', j === i % 4)); }
function runIntro() {
  introTimers.forEach(clearTimeout); introTimers = [];
  hero.classList.remove('intro'); void hero.offsetWidth;
  if (reduce) return;
  hero.classList.add('intro');
  treeGrow();
  for (let b = 0; b <= 8; b++) introTimers.push(setTimeout(() => beatDot(b), b * BEAT));
  introTimers.push(setTimeout(() => { const f = $('#flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }, 8 * BEAT));
}

/* hero tree canvas: the generations grow from one root */
const tc = $('#treeCanvas'), tctx = tc.getContext('2d');
let branches = [], growT0 = 0, heroVisible = true;
function buildBranches() {
  const r = rng(1839); branches = [];
  const W = tc.width, H = tc.height, dpr = devicePixelRatio || 1;
  const grow = (x, y, ang, len, depth, t) => {
    if (depth > 8 || len < 8 * dpr) return;
    const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
    branches.push({ x, y, x2, y2, depth, t, w: Math.max(.6, (9 - depth) * .55) * dpr });
    const n = depth < 2 ? 2 + (r() > .5) : 1 + (r() > .35);
    for (let i = 0; i < n; i++) grow(x2, y2, ang + (r() - .5) * 1.1, len * (.68 + r() * .14), depth + 1, t + .22 + r() * .12);
  };
  grow(W * .22, H * 1.02, -Math.PI / 2, H * .2, 0, 0);
  grow(W * .22, H * 1.02, -Math.PI / 2 - .5, H * .15, 1, .1);
}
function sizeTree() { const dpr = devicePixelRatio || 1; tc.width = tc.clientWidth * dpr; tc.height = tc.clientHeight * dpr; buildBranches(); drawTree(reduce ? 99 : (performance.now() - growT0) / 1000); }
function drawTree(t) {
  const W = tc.width, H = tc.height; tctx.clearRect(0, 0, W, H);
  tctx.lineCap = 'round';
  for (const b of branches) {
    const k = clamp((t - b.t) / .45); if (k <= 0) continue;
    tctx.strokeStyle = `rgba(214,173,85,${.55 - b.depth * .045})`; tctx.lineWidth = b.w;
    tctx.beginPath(); tctx.moveTo(b.x, b.y); tctx.lineTo(lerp(b.x, b.x2, k), lerp(b.y, b.y2, k)); tctx.stroke();
    if (k === 1 && b.depth >= 6) { const pulse = .5 + .5 * Math.sin(t * 2 + b.x); tctx.fillStyle = `rgba(242,212,145,${.25 + .5 * pulse})`; tctx.beginPath(); tctx.arc(b.x2, b.y2, 1.6 * (devicePixelRatio || 1), 0, 7); tctx.fill(); }
  }
}
function treeGrow() { growT0 = performance.now(); }
function treeLoop() { if (heroVisible && !reduce) drawTree((performance.now() - growT0) / 1000); requestAnimationFrame(treeLoop); }

/* ---------- tour: one continuous camera ---------- */
const world = $('#world'), tour = $('#tour'), blurwrap = $('#blurwrap');
const STOPS = [
  { cam: { x: 60, y: 20, z: 0, rx: 57, rz: -24, d: -1500 }, eyebrow: '01', title: 'שש מחלקות. מערכת אחת.', text: () => 'נתמכים, עץ הדורות, יולדות, הלוואות, חלוקות ודוחות. הכל יושב על אותו משטח, מחובר לאותו שורש.' },
  { cam: { x: -420, y: -480, z: 120, rx: 50, rz: -6, d: -380 }, eyebrow: '02', title: 'כל נתמך במקומו', text: () => `${fmt(D.beneficiaries.total)} נתמכים רשומים: ${fmt(D.beneficiaries.by_status.approved || 0)} מאושרים, ${fmt(D.beneficiaries.by_status.pending || 0)} ממתינים ו־${fmt(D.beneficiaries.by_status.review || 0)} בבדיקה.` },
  { cam: { x: 400, y: -250, z: 230, rx: 74, rz: 0, d: -320 }, eyebrow: '03', title: 'לוח בקרה', text: () => 'כל המספרים החשובים בהצצה אחת, עם קיצורים לפעולות של כל יום ושעון זמני היום ברקע.' },
  { cam: { x: -470, y: 150, z: 10, rx: 16, rz: 8, d: -360 }, eyebrow: '04', title: 'עץ הדורות', text: () => `${fmt(D.lineage.nodes)} צמתים ב־${fmt(D.lineage.generations)} דורות. כל צומת עובר אימות לפני שהוא נכנס לעץ.` },
  { cam: { x: -60, y: 600, z: 46, rx: 14, rz: -9, d: -180 }, eyebrow: '05', title: 'פורטל בתי ההחלמה', text: () => `קישור מאובטח לכל אחד מ־${fmt(D.recovery_homes)} בתי ההחלמה. סיסמה אישית, ורק הרשימה הפעילה.` },
  { cam: { x: 520, y: 600, z: 0, rx: 0, rz: 0, d: 1180 }, eyebrow: '06', title: 'הכל מתחיל בשורש', text: () => 'ומכאן, אל הממשק עצמו.' }
];
// [progress, stop index] — holds give each stop time on screen
const KEYS = [[0, 0], [.07, 0], [.2, 1], [.27, 1], [.4, 2], [.48, 2], [.6, 3], [.67, 3], [.79, 4], [.85, 4], [.98, 5], [1, 5]];
const rail = $('#rail'); rail.innerHTML = STOPS.map(() => '<li></li>').join('');
let curStop = -1, lastY = scrollY, vel = 0, blurNow = 0;
function camAt(p) {
  let i = 0; while (i < KEYS.length - 2 && p > KEYS[i + 1][0]) i++;
  const [p0, s0] = KEYS[i], [p1, s1] = KEYS[i + 1];
  const k = p1 > p0 ? ease(clamp((p - p0) / (p1 - p0))) : 0;
  const a = STOPS[s0].cam, b = STOPS[s1].cam, c = {};
  for (const key in a) c[key] = lerp(a[key], b[key], k);
  // nearest stop for captions
  let near = 0, best = 9; KEYS.forEach(([kp, s]) => { const dd = Math.abs(p - kp); if (dd < best) { best = dd; near = s; } });
  return { c, near };
}
function setCaption(i) {
  if (i === curStop) return; curStop = i;
  const s = STOPS[i];
  $('#capEyebrow').textContent = `${s.eyebrow} / 0${STOPS.length}`;
  const split = (el, txt) => { el.innerHTML = txt.split(/(\s+)/).map((w, j) => `<span class="cw" style="--i:${j}">${w}</span>`).join(''); el.classList.remove('go'); void el.offsetWidth; el.classList.add('go'); };
  split($('#capTitle'), s.title); split($('#capText'), s.text());
  $$('li', rail).forEach((li, j) => li.classList.toggle('on', j === i));
  audio.narrate('tour' + i);
}
function tourFrame() {
  const r = tour.getBoundingClientRect();
  const span = tour.offsetHeight - innerHeight;
  const p = clamp(-r.top / span);
  const inView = r.top < innerHeight && r.bottom > 0;
  if (!inView) return;
  const { c, near } = camAt(p);
  const s = Math.min(1, innerWidth / 1300) * (innerWidth < 620 ? 1.25 : 1);
  world.style.transform = `translateZ(${c.d}px) scale(${s}) rotateX(${c.rx}deg) rotateZ(${c.rz}deg) translate3d(${-c.x}px, ${-c.y}px, ${-c.z}px)`;
  setCaption(near);
  // plane tree draws itself as the shot progresses
  $$('.grow', planeSvg).forEach(pth => { pth.style.strokeDashoffset = pth._len * (1 - clamp(p * 1.6 - pth._d)); });
  // match cut: dive into the root, the iris opens
  const irisK = clamp((p - .9) / .1);
  const iris = $('#iris'), dia = ease(irisK) * Math.hypot(innerWidth, innerHeight) * 1.1;
  iris.style.width = iris.style.height = dia + 'px';
  iris.style.opacity = irisK > 0 ? 1 : 0;
  $('#captions').style.opacity = 1 - clamp((p - .93) / .04);
  $('#scrollHint').style.opacity = p < .03 ? 1 : 0;
}
// motion blur from scroll velocity
function blurFrame() {
  const y = scrollY; vel = lerp(vel, Math.abs(y - lastY), .25); lastY = y;
  const target = reduce ? 0 : Math.min(2.6, vel * .035);
  blurNow = lerp(blurNow, target, .3);
  blurwrap.style.filter = blurNow > .08 ? `blur(${blurNow.toFixed(2)}px)` : 'none';
}

/* plane drawing: branches from the root to every device */
const planeSvg = $('#planeSvg');
function drawPlane() {
  const O = [1400, 1100], pt = (x, y) => [x + O[0], y + O[1]];
  const root = pt(520, 640);
  const targets = [pt(400, 260), pt(-470, 150), pt(-60, 600), pt(-420, -330), pt(-420, -640)];
  const r = rng(77); let s = '';
  targets.forEach((t, i) => {
    const mx = (root[0] + t[0]) / 2 + (r() - .5) * 400, my = (root[1] + t[1]) / 2 + (r() - .5) * 300;
    s += `<path class="grow" data-d="${i * .06}" d="M${root[0]},${root[1]} Q${mx},${my} ${t[0]},${t[1]}" fill="none" stroke="rgba(214,173,85,.75)" stroke-width="5" stroke-linecap="round"/>`;
    s += `<circle cx="${t[0]}" cy="${t[1]}" r="12" fill="#f2d491"/><circle cx="${t[0]}" cy="${t[1]}" r="26" fill="none" stroke="rgba(214,173,85,.4)" stroke-width="3"/>`;
  });
  // fine generations
  const fine = (x, y, a, len, dep) => {
    if (dep > 6) return; const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    s += `<path class="grow" data-d="${.1 + dep * .07}" d="M${x},${y} L${x2},${y2}" stroke="rgba(214,173,85,${.42 - dep * .05})" stroke-width="${4 - dep * .5}" stroke-linecap="round"/>`;
    if (dep >= 4) s += `<circle cx="${x2}" cy="${y2}" r="4" fill="rgba(242,212,145,.6)"/>`;
    for (let i = 0; i < 2; i++) fine(x2, y2, a + (r() - .5) * 1.4, len * .72, dep + 1);
  };
  [-2.2, -1.2, .3, 1.4, 2.6].forEach(a => fine(root[0], root[1], a, 220, 1));
  planeSvg.innerHTML = s;
  $$('.grow', planeSvg).forEach(p => { p._len = p.getTotalLength(); p._d = +p.dataset.d; p.style.strokeDasharray = p._len; p.style.strokeDashoffset = p._len; });
}
function drawPillars() {
  const bs = D.beneficiaries.by_status, ks = ['approved', 'pending', 'review', 'rejected'], max = Math.max(1, ...ks.map(k => bs[k] || 0));
  $('#pillars').innerHTML = ks.map(k => { const h = 30 + (bs[k] || 0) / max * 300; return `<div class="pillar" style="--h:${h}px;--c:${SC[k]}"><div class="face shadow"></div><div class="face front"></div><div class="face side"></div><div class="face top"><span><b>${fmt(bs[k] || 0)}</b><small>${STATUS[k]}</small></span></div><div class="plabel">${STATUS[k]}</div></div>`; }).join('');
}

/* ---------- match cut part 2: circle becomes the app window ---------- */
const appwin = $('#appwin');
function morphFrame() {
  if (reduce) { appwin.style.clipPath = 'none'; return; }
  const r = appwin.getBoundingClientRect();
  const q = clamp((innerHeight - r.top) / (innerHeight * .62));
  const k = ease(q), w = r.width, h = r.height, r0 = 70;
  const cy = clamp((innerHeight - r.top) * .5, r0, h - r0);
  const ix = (w / 2 - r0) * (1 - k);
  appwin.style.clipPath = k >= .97 ? 'none' : `inset(${(cy - r0) * (1 - k)}px ${ix}px ${(h - cy - r0) * (1 - k)}px ${ix}px round ${lerp(r0, 18, k)}px)`;
  appwin.style.transform = `rotateX(${(1 - k) * 16}deg) scale(${lerp(.92, 1, k)})`;
}

/* ---------- blueprint: a pen draws the system ---------- */
const bp = $('#bp'), NS = 'http://www.w3.org/2000/svg';
let bpParts = [], bpTotal = 0, pen;
function jit(r, a = 2.2) { return (r() - .5) * a; }
function sketchRect(r, x, y, w, h) {
  const p = [[x + jit(r), y + jit(r)], [x + w + jit(r), y + jit(r)], [x + w + jit(r), y + h + jit(r)], [x + jit(r), y + h + jit(r)]];
  return `M${p[0][0] - 6},${p[0][1]} L${p[1][0] + 4},${p[1][1]} M${p[1][0]},${p[1][1] - 5} L${p[2][0]},${p[2][1] + 4} M${p[2][0] + 5},${p[2][1]} L${p[3][0] - 4},${p[3][1]} M${p[3][0]},${p[3][1] + 5} L${p[0][0]},${p[0][1] - 4}`;
}
function arrow(x1, y1, x2, y2) { const a = Math.atan2(y2 - y1, x2 - x1), L = 12; return `M${x1},${y1} L${x2},${y2} M${x2 - L * Math.cos(a - .45)},${y2 - L * Math.sin(a - .45)} L${x2},${y2} L${x2 - L * Math.cos(a + .45)},${y2 - L * Math.sin(a + .45)}`; }
function buildBlueprint() {
  const r = rng(1762);
  const X = [960, 730, 500, 270], BW = 190;
  const top = [['פורטל ציבורי', 'chasamsofer.info'], ['אימות במייל', 'קוד חד־פעמי'], ['בדיקת ייחוס', 'מול עץ הדורות'], ['אישור צוות', 'בודק · מנהל']];
  const svc = [['הלוואה', 'גמ״ח עד ₪30,000'], ['יולדות', 'כרטיס נדרים פלוס'], ['חלוקות', 'לחגים ולמועדים'], ['דוחות', 'מגמות ונתונים']];
  const infra = [['Supabase', 'הרשאות ברמת שורה'], ['Resend', '7 תיבות מחלקתיות'], ['נדרים פלוס', 'הטענה ופריקה'], ['Railway + Cloudflare', 'פריסה אוטומטית']];
  const steps = [];
  const txt = (x, y, t, cls) => ({ x, y, t, cls });
  top.forEach((b, i) => {
    if (i === 2) steps.push({ d: `M${X[i] - 80},${148} L${X[i] + 80},${146}`, cls: 'gold', labels: [] });
    steps.push({ d: sketchRect(r, X[i] - BW / 2, 70, BW, 100), labels: [txt(X[i], 116, b[0], 'lbl'), txt(X[i], 146, b[1], 'sub')] });
    if (i < 3) steps.push({ d: arrow(X[i] - BW / 2 - 4, 120, X[i + 1] + BW / 2 + 6, 120), labels: [] });
  });
  steps.push({ d: `M${X[3]},172 L${X[3]},232 M${X[3] - 2},232 L${X[0] + 2},230`, labels: [] });
  X.forEach(x => steps.push({ d: arrow(x, 231, x, 286), labels: [] }));
  svc.forEach((b, i) => steps.push({ d: sketchRect(r, X[i] - BW / 2, 290, BW, 92), labels: [txt(X[i], 332, b[0], 'lbl'), txt(X[i], 360, b[1], 'sub')] }));
  steps.push({ d: `M${X[1] + 112},336 C${X[1] + 130},270 ${X[1] - 140},262 ${X[1] - 116},344 C${X[1] - 100},400 ${X[1] + 120},404 ${X[1] + 106},330`, cls: 'red', labels: [txt(X[1] + 10, 448, 'פריקה אוטומטית אחרי 6 שבועות', 'hand')] });
  X.forEach(x => steps.push({ d: `M${x},386 L${x},400 M${x},410 L${x},424 M${x},434 L${x},486`, cls: 'ghost', labels: [] }));
  steps.push({ d: sketchRect(r, 80, 490, 940, 92) + ` M315,492 L317,580 M550,491 L549,581 M785,492 L786,580`, labels: infra.map((b, i) => txt(1020 - 117.5 - i * 235, 530, b[0], 'lbl')).concat(infra.map((b, i) => txt(1020 - 117.5 - i * 235, 560, b[1], 'sub'))) });
  steps.push({ d: arrow(X[3] - 40, 30, X[3] + 30, 66), cls: 'red', labels: [txt(X[3] - 20, 24, '4 תפקידים · הרשאה לכל מחלקה', 'hand')] });
  steps.push({ d: arrow(X[0] + 60, 200, X[0] + 20, 174), cls: 'red', labels: [txt(X[0] + 70, 222, 'פורטל נפרד לכל בית החלמה', 'hand')] });

  bp.innerHTML = '';
  const hl = document.createElementNS(NS, 'rect'); hl.setAttribute('class', 'hl hide'); hl.setAttribute('x', X[2] - 82); hl.setAttribute('y', 98); hl.setAttribute('width', 164); hl.setAttribute('height', 26); hl.setAttribute('rx', 4); bp.appendChild(hl);
  bpParts = []; bpTotal = 0;
  steps.forEach(st => {
    const p = document.createElementNS(NS, 'path'); p.setAttribute('d', st.d); p.setAttribute('class', 'stroke ' + (st.cls || '')); bp.appendChild(p);
    const len = p.getTotalLength(); p.style.strokeDasharray = len; p.style.strokeDashoffset = len;
    const labels = st.labels.map(l => { const t = document.createElementNS(NS, 'text'); t.setAttribute('x', l.x); t.setAttribute('y', l.y); t.setAttribute('class', l.cls + ' hide'); if (l.cls === 'hand') t.setAttribute('text-anchor', 'middle'); t.textContent = l.t; bp.appendChild(t); return t; });
    bpParts.push({ p, len, start: bpTotal, labels, gold: st.cls === 'gold' }); bpTotal += len;
  });
  pen = document.createElementNS(NS, 'g');
  pen.innerHTML = '<g transform="rotate(-35)"><rect x="-5" y="-84" width="10" height="66" rx="3" fill="#1b2a7a"/><rect x="-5" y="-92" width="10" height="10" rx="2" fill="#d6ad55"/><path d="M-5,-18 L5,-18 L0,0 Z" fill="#c8a24a"/><circle r="1.6" fill="#1b2a7a"/></g>';
  bp.appendChild(pen);
  $('#bpDate').textContent = hebDate(new Date());
}
function bpFrame() {
  const sec = $('#build'), r = sec.getBoundingClientRect();
  if (r.top > innerHeight || r.bottom < 0) return;
  const p = clamp(-r.top / (sec.offsetHeight - innerHeight) * 1.15);
  const L = p * bpTotal; let tip = null;
  bpParts.forEach(part => {
    const k = clamp((L - part.start) / part.len);
    part.p.style.strokeDashoffset = part.len * (1 - k);
    part.labels.forEach(t => t.classList.toggle('hide', k < .85));
    if (part.gold) $('.hl', bp).classList.toggle('hide', k < .9);
    if (k > 0 && k < 1) tip = part.p.getPointAtLength(k * part.len);
  });
  if (!tip) { const last = bpParts[bpParts.length - 1]; tip = L <= 0 ? bpParts[0].p.getPointAtLength(0) : last.p.getPointAtLength(last.len); }
  pen.setAttribute('transform', `translate(${tip.x},${tip.y})`);
  pen.style.opacity = p >= 1 ? .35 : 1;
  if (p > .05) audio.narrate('build');
}

/* ---------- numbers ---------- */
function spark() {
  const ks = Object.keys(D.beneficiaries.by_month || {}).sort().slice(-6); if (ks.length < 2) return '';
  let acc = D.beneficiaries.total - ks.reduce((a, k) => a + +D.beneficiaries.by_month[k], 0);
  const vals = ks.map(k => (acc += +D.beneficiaries.by_month[k]));
  const mn = Math.min(...vals), mx = Math.max(...vals), W = 600, H = 70;
  const xy = vals.map((v, i) => [i / (vals.length - 1) * W, H - 6 - (mx === mn ? .5 : (v - mn) / (mx - mn)) * (H - 14)]);
  const line = xy.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const last = xy[xy.length - 1];
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="מגמת הנתמכים בחצי השנה האחרונה"><defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d6ad55" stop-opacity=".35"/><stop offset="1" stop-color="#d6ad55" stop-opacity="0"/></linearGradient></defs>
  ${[.33, .66].map(f => `<line x1="0" x2="${W}" y1="${H * f}" y2="${H * f}" stroke="rgba(255,255,255,.06)"/>`).join('')}
  <path d="${line} L${W},${H} L0,${H} Z" fill="url(#sg)"/><path d="${line}" fill="none" stroke="#d6ad55" stroke-width="2" vector-effect="non-scaling-stroke"/><circle cx="${last[0]}" cy="${last[1]}" r="4" fill="#f2d491"/></svg>`;
}
let numsShown = false;
function buildNumbers() {
  const b = D.beneficiaries, l = D.loans, m = D.maternity, L = D.lineage;
  const dists = D.distributions || [];
  const items = [
    { v: b.total, k: 'נתמכים רשומים', d: `${fmt(b.by_status.approved || 0)} מאושרים · ${fmt((b.by_status.pending || 0) + (b.by_status.review || 0))} בתהליך`, wide: true, gold: true, spark: true },
    { v: L.nodes, k: 'צמתים בעץ הדורות', d: `${fmt(L.generations)} דורות · ${fmt(L.verified)} מאומתים` },
    { v: (l.by_status.active || 0) + (l.by_status.approved || 0), k: 'הלוואות פעילות', d: `${cur(l.amount_active)} בפעילות` },
    { v: l.amount_total, k: 'הולוו בסך הכל', d: `${fmt(l.total)} הלוואות`, f: cur, gold: true },
    { v: m.total, k: 'תיקי יולדות', d: `${fmt(m.by_status.active || 0)} פעילים כעת` },
    { v: b.children_total, k: 'ילדים רשומים בתיקים', d: `${fmt(D.families)} משפחות` },
    { v: dists.reduce((a, d) => a + (+d.received || 0), 0), k: 'משלוחי חלוקה שנמסרו', d: `${fmt(dists.length)} חלוקות` },
    { v: D.documents.verified, k: 'מסמכים מאומתים', d: `מתוך ${fmt(D.documents.total)}` }
  ];
  $('#numGrid').innerHTML = items.map((it, i) => `<div class="nb ${it.wide ? 'wide' : ''}"><span class="v num ${it.gold ? 'gold' : ''} ${(it.f ? it.f(it.v) : fmt(it.v)).length > 8 ? 'long' : ''}" data-v="${it.v}" data-cur="${it.f ? 1 : 0}" data-i="${i}">${it.f ? it.f(numsShown ? it.v : 0) : fmt(numsShown ? it.v : 0)}</span><div class="k">${it.k}</div><div class="d">${it.d}</div>${it.spark ? `<div class="spark">${spark()}</div>` : ''}</div>`).join('');
}
function showNumbers() {
  if (numsShown) return; numsShown = true;
  $$('#numGrid .v').forEach(el => {
    const i = +el.dataset.i, v = +el.dataset.v, f = el.dataset.cur === '1' ? cur : fmt;
    // each figure lands on its own beat
    setTimeout(() => { countUp(el, 0, v, BEAT * .9, f); setTimeout(() => { el.classList.remove('land'); void el.offsetWidth; el.classList.add('land'); }, BEAT * .9 - 60); }, reduce ? 0 : audio.nextBeatDelay() + i * BEAT);
  });
}
function notes() {
  const t = D.sample ? 'המספרים כאן זמניים ויתעדכנו אוטומטית מהמערכת.' : `המספרים נמשכים ישירות מהמערכת · נכון ל־${new Date(D.asOf || Date.now()).toLocaleDateString('he-IL')}.`;
  $('#dataNote').textContent = t + ' שמות ופרטים מזהים מוסתרים בכוונה; השורות בטבלאות הן לדוגמה.';
  $('#numNote').textContent = t;
}

/* ---------- kinetic headings ---------- */
function kinetic() {
  $$('[data-kin]').forEach(h => { h.innerHTML = h.textContent.split(/(\s+)/).map((w, i) => `<span class="kw" style="--i:${i}">${w}</span>`).join(''); });
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('go'); io.unobserve(e.target); } }), { threshold: .6 });
  $$('[data-kin]').forEach(h => io.observe(h));
  const ion = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) showNumbers(); }), { threshold: .25 });
  ion.observe($('#numGrid'));
  const iod = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) audio.narrate(e.target.id === 'demo' ? 'demo' : 'finale'); }), { threshold: .45 });
  iod.observe($('#demo')); iod.observe($('#contact'));
  const ioh = new IntersectionObserver(es => es.forEach(e => { heroVisible = e.isIntersecting; }));
  ioh.observe(hero);
}

/* ---------- film grain ---------- */
function grain() {
  const tiles = [];
  for (let k = 0; k < 4; k++) {
    const c = document.createElement('canvas'); c.width = c.height = 220; const x = c.getContext('2d'), im = x.createImageData(220, 220);
    for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
    x.putImageData(im, 0, 0); tiles.push(`url(${c.toDataURL()})`);
  }
  const g = $('#grain'); let i = 0;
  g.style.backgroundImage = tiles[0];
  if (reduce) return;
  setInterval(() => { i = (i + 1) % 4; g.style.backgroundImage = tiles[i]; g.style.backgroundPosition = `${Math.random() * 220}px ${Math.random() * 220}px`; }, 90);
}

/* ---------- sound: original score + narration ---------- */
const audio = (() => {
  const A = n => { const a = new Audio('audio/' + n + '.mp3'); a.preload = 'none'; return a; };
  let on = false, bed, intro, drop, cur = null, played = new Set(), dotRaf;
  const VO = { hero: 'vo0', tour0: 'vo1', tour1: 'vo2', tour2: 'vo3', tour3: 'vo4', tour4: 'vo5', tour5: 'vo6', demo: 'vo7', build: 'vo8', finale: 'vo9' };
  const vos = {};
  const BED_VOL = .34, DUCK = .13;
  function ensure() {
    if (bed) return;
    bed = A('bed'); bed.loop = true; bed.volume = BED_VOL; intro = A('intro'); intro.volume = .8; drop = A('drop'); drop.volume = .75;
    Object.values(VO).forEach(v => { vos[v] = A(v); vos[v].volume = 1; });
    [bed, intro, drop].forEach(a => { a.preload = 'auto'; a.load(); });
  }
  function duck(d) { if (!bed) return; const target = d ? DUCK : BED_VOL; const from = bed.volume, t0 = performance.now(); const st = t => { const k = clamp((t - t0) / 350); bed.volume = lerp(from, target, k); if (k < 1) requestAnimationFrame(st); }; requestAnimationFrame(st); }
  function narrate(key, force) {
    if (!on) return; const id = VO[key]; if (!id) return;
    if (!force && played.has(key)) return;
    played.add(key);
    if (cur && !cur.paused) { cur.pause(); }
    cur = vos[id]; cur.currentTime = 0; duck(true);
    cur.onended = () => duck(false);
    cur.play().catch(() => duck(false));
  }
  function beatLoop() { if (on && bed && !bed.paused) beatDot(Math.floor(bed.currentTime / (BEAT / 1000))); dotRaf = requestAnimationFrame(beatLoop); }
  function playIntro() {
    intro.currentTime = 0; drop.currentTime = 0; bed.pause(); bed.currentTime = 0;
    let started = false;
    const go = () => { if (started) return; started = true; runIntro(); };
    intro.onplaying = go;
    intro.play().catch(go);
    setTimeout(go, 400);
    const watch = () => {
      if (!on) return;
      if (intro.currentTime >= 3.97 || intro.ended) { drop.play().catch(() => {}); bed.currentTime = 0; bed.play().catch(() => {}); setTimeout(() => narrate('hero', true), 300); return; }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
  }
  function toggle() {
    on = !on; ensure();
    const btn = $('#soundBtn'); btn.setAttribute('aria-pressed', on); btn.setAttribute('aria-label', on ? 'השתקה' : 'הפעלת צליל');
    $('#soundIc').innerHTML = on ? '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>' : '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';
    if (!on) { [bed, intro, drop, cur].forEach(a => a && a.pause()); cancelAnimationFrame(dotRaf); return; }
    played = new Set();
    if (hero.getBoundingClientRect().bottom > innerHeight * .4) playIntro();
    else { bed.play().catch(() => {}); if (curStop >= 0 && tour.getBoundingClientRect().top < 0 && tour.getBoundingClientRect().bottom > innerHeight) narrate('tour' + curStop, true); }
    beatLoop();
  }
  function replay() { if (on) playIntro(); else runIntro(); }
  function nextBeatDelay() { if (on && bed && !bed.paused) { const b = BEAT / 1000; return Math.round((b - bed.currentTime % b) * 1000); } return 0; }
  return { toggle, replay, narrate, nextBeatDelay };
})();
$('#soundBtn').addEventListener('click', () => audio.toggle());
$('#replayBtn').addEventListener('click', () => audio.replay());

/* ---------- live numbers from the system ---------- */
async function loadLive() {
  try {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 5000);
    const res = await fetch(STATS_API, { cache: 'no-store', signal: ctl.signal }); clearTimeout(to);
    if (!res.ok) return;
    const j = await res.json();
    if (!j || !j.beneficiaries || typeof j.beneficiaries.total !== 'number') return;
    Object.assign(D, j, { sample: false, asOf: j.generated_at || new Date().toISOString() });
    refreshAll();
  } catch (e) { /* stays on data.js */ }
}

function refreshAll() {
  buildModel(); renderNav(); render(); renderScreens(); drawPillars(); buildNumbers(); notes();
  if (curStop >= 0) { const s = curStop; curStop = -1; setCaption(s); }
}

/* ---------- boot ---------- */
function frame() { blurFrame(); tourFrame(); morphFrame(); bpFrame(); requestAnimationFrame(frame); }
function boot() {
  buildModel(); renderNav(); render(); renderScreens(); drawPillars(); drawPlane(); buildBlueprint(); buildNumbers(); notes(); kinetic(); grain();
  tickClock(); setInterval(tickClock, 1000);
  sizeTree(); addEventListener('resize', () => { sizeTree(); renderScreens(); });
  runIntro(); treeLoop(); frame();
  loadLive();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
