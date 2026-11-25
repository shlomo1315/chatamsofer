// העיצוב של סולם הדורות, מועתק מהמוקאפ שאושר (כיוון ב׳). הכול תחת .lad,
// כדי שלא ידלוף למסכים אחרים. תפריט הצד והכותרת לטלפון מגיעים ממסגרת האדמין.
export const LADDER_CSS = `
.lad{
  --bg:#F4F2ED;--sf:#FCFBF8;--wh:#FFFFFF;
  --ink:#14213D;--ink2:#4A5466;--ink3:#868C97;
  --ln:#E4DFD5;--ln2:#CCC5B7;--trk:#EBE6DC;
  --v:#1E6A4B;--vbg:#E4EFE8;
  --p:#B7791F;--pbg:#F8EDD5;--pl:#E6C27E;
  --r:#A3322B;--rbg:#F7E5E2;
  --cur:#ECEFF5;
  --r1:6px;--r2:10px;
  --t1:12px;--t2:13px;--t3:15px;--t4:17px;--t5:22px;--t6:28px;--t7:40px;
  font-family:var(--font-heebo),Heebo,sans-serif;background:var(--bg);color:var(--ink);font-size:var(--t3);line-height:1.5;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased;
  margin:-20px;padding:16px 40px 64px;min-block-size:100vh
}
@media (min-width:1024px){.lad{margin:-24px}}
.lad *{box-sizing:border-box;margin:0;padding:0}
.lad button{font:inherit;color:inherit;cursor:pointer;background:none;border:0}
.lad button:focus-visible,.lad [tabindex]:focus-visible,.lad a:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
.lad a{color:inherit}
.lad .wrap{max-inline-size:1140px}

.lad .top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1px solid var(--ln);margin-bottom:32px;gap:16px}
.lad .tabs{display:flex;gap:24px}
.lad .tabs a{display:block;padding:12px 0;font-size:14px;color:var(--ink3);text-decoration:none;border-bottom:2px solid transparent;margin-bottom:-1px}
.lad .tabs a.on{color:var(--ink);font-weight:700;border-color:var(--ink)}
.lad .tools{display:flex;align-items:center;gap:8px;padding-bottom:8px}
.lad .gh{border:1px solid var(--ln2);background:var(--wh);border-radius:var(--r1);font-size:var(--t2);font-weight:600;padding:0 12px;min-block-size:36px;transition:background .15s}
.lad .gh:hover{background:var(--bg)}

.lad .hd{display:flex;justify-content:space-between;align-items:flex-end;gap:32px;margin-bottom:32px}
.lad .crumb{font-size:var(--t2);color:var(--ink3)}
.lad .crumb button{text-decoration:underline;text-underline-offset:3px;color:var(--ink2);font-size:var(--t2)}
.lad h1{font-size:var(--t7);font-weight:800;line-height:1.1;letter-spacing:-.01em;margin:4px 0 8px;text-wrap:balance}
.lad .subl{color:var(--ink2)}
.lad .subl b{color:var(--ink);font-weight:600}
.lad .prog{flex:none;text-align:end}
.lad .prog .big{font-size:var(--t7);font-weight:800;line-height:1}
.lad .prog .big small{font-size:var(--t4);font-weight:500;color:var(--ink3)}
.lad .prog .lbl{font-size:var(--t1);color:var(--ink3);margin:4px 0 8px}
.lad .segs{display:flex;gap:4px;direction:rtl;flex-wrap:wrap}
.lad .segs button{inline-size:20px;block-size:8px;border-radius:2px;background:var(--pbg);box-shadow:inset 0 0 0 1px var(--pl);padding:0;transition:transform .15s}
.lad .segs button:hover{transform:scaleY(1.4)}
.lad .segs .v{background:var(--v);box-shadow:none}
.lad .segs .r{background:var(--r);box-shadow:none}
.lad .segs .c{box-shadow:inset 0 0 0 2px var(--ink)}

.lad .grid{display:grid;grid-template-columns:344px minmax(0,1fr);gap:24px;align-items:start}

.lad .card{background:var(--sf);border:1px solid var(--ln);border-radius:var(--r2);padding:24px;position:sticky;top:24px}
.lad .meta{display:flex;align-items:center;gap:8px;font-size:var(--t1);color:var(--ink3)}
.lad .chip{display:inline-block;font-size:var(--t1);font-weight:600;padding:1px 8px;border-radius:99px;background:var(--pbg);color:#8A5A10}
.lad .chip.v{background:var(--vbg);color:var(--v)}
.lad .chip.r{background:var(--rbg);color:var(--r)}
.lad .card h2{font-size:var(--t6);font-weight:800;line-height:1.2;margin:8px 0 4px}
.lad .lin{font-size:var(--t2);color:var(--ink3)}
.lad .stats{display:grid;grid-template-columns:repeat(3,1fr);border-block:1px solid var(--ln);margin:16px 0}
.lad .stats div{padding:12px 0;padding-inline-start:12px;border-inline-start:1px solid var(--ln)}
.lad .stats div:first-child{border:0;padding-inline-start:0}
.lad .stats b{display:block;font-size:var(--t5);font-weight:800;line-height:1.2}
.lad .stats span{font-size:var(--t1);color:var(--ink3)}
.lad .warn{background:var(--pbg);border:1px solid #EBD3A3;border-radius:var(--r1);padding:8px 12px;font-size:var(--t2);color:#5E4310;margin-bottom:16px}
.lad .warn b{display:block;color:#4A350C}
.lad .rules p{font-size:var(--t2);color:var(--ink2);margin-bottom:4px;text-wrap:pretty}
.lad .rules b{color:var(--ink)}
.lad .acts{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px}
.lad .acts button,.lad .navb button{min-block-size:44px;border-radius:var(--r1);font-weight:700;font-size:var(--t3);display:flex;align-items:center;justify-content:center;gap:8px;transition:transform .1s,background .15s}
.lad .acts button:active,.lad .navb button:active{transform:scale(.98)}
.lad .acts button:disabled{opacity:.6;cursor:default}
.lad .ok{background:var(--v);color:#fff}
.lad .ok:hover{background:#185A3F}
.lad .no{background:var(--wh);color:var(--r);box-shadow:inset 0 0 0 1px #DDB3AE}
.lad .no:hover{background:var(--rbg)}
.lad kbd{font:600 11px var(--font-heebo),Heebo,sans-serif;border:1px solid currentColor;border-radius:3px;padding:0 4px;opacity:.7}
.lad .navb{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
.lad .navb button{background:var(--wh);box-shadow:inset 0 0 0 1px var(--ln2);font-weight:500;font-size:14px;color:var(--ink2)}
.lad .navb button:hover{background:var(--bg)}
.lad .navb button:disabled{opacity:.4;cursor:default}
.lad .queue{margin-top:16px;padding-top:12px;border-top:1px dashed var(--ln2);font-size:var(--t2);color:var(--ink3)}
.lad .queue b{color:var(--ink2);font-weight:500}
.lad .done-box p{font-size:var(--t2);color:var(--ink2);margin:8px 0 16px}
.lad .done-box p button{text-decoration:underline;text-underline-offset:3px;color:var(--ink);font-weight:600}
.lad .undo{font-size:var(--t2);text-decoration:underline;text-underline-offset:3px;color:var(--ink2);margin-top:12px}

.lad .viz{background:var(--sf);border:1px solid var(--ln);border-radius:var(--r2);padding:24px;min-width:0}
.lad .ph{display:flex;justify-content:space-between;align-items:baseline;gap:16px;margin-bottom:24px;flex-wrap:wrap}
.lad .ph b{font-size:var(--t4);font-weight:700}
.lad .ph span{font-size:var(--t2);color:var(--ink3);margin-inline-start:8px}
.lad .leg{display:flex;gap:16px;font-size:var(--t1);color:var(--ink3)}
.lad .leg span{margin:0}
.lad .leg i{display:inline-block;inline-size:8px;block-size:8px;border-radius:2px;margin-inline-end:4px;vertical-align:0}

.lad .kids{position:relative;margin-inline-start:20px;padding-inline-start:20px}
.lad .row{position:relative}
.lad .row::before{content:"";position:absolute;inset-inline-start:-20px;top:0;bottom:0;border-inline-start:1px solid var(--ln2)}
.lad .row:last-child::before{bottom:auto;block-size:24px}
.lad .row::after{content:"";position:absolute;inset-inline-start:-20px;top:24px;inline-size:26px;border-top:1px solid var(--ln2)}
.lad .ln{display:grid;grid-template-columns:18px minmax(120px,168px) minmax(0,1fr) 44px 76px;align-items:center;gap:12px;min-block-size:40px;padding:4px 8px;margin:2px 0;border-radius:var(--r1);transition:background .2s}
.lad .row.nav .ln{cursor:pointer}
.lad .row.nav .ln:hover{background:#F1EEE7}
.lad .row.cur .ln{background:var(--cur);box-shadow:inset 0 0 0 1px var(--ink)}
.lad .row.flash .ln{animation:lad-fl .9s ease-out}
@keyframes lad-fl{0%{background:#D8E9DF}100%{background:transparent}}
.lad .row.r.flash .ln{animation:lad-flr .9s ease-out}
@keyframes lad-flr{0%{background:#F2D3CF}100%{background:transparent}}
.lad .ic{display:grid;place-items:center}
.lad .ic svg{inline-size:16px;block-size:16px;display:block}
.lad .nm{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lad .nm em{font-style:normal;font-size:11px;font-weight:600;color:#8A5A10;background:var(--pbg);border-radius:3px;padding:0 4px;margin-inline-start:6px}
.lad .cur .nm{font-weight:700}
.lad .r .nm{color:var(--r);text-decoration:line-through;text-decoration-thickness:1px}
.lad .bar{block-size:6px;background:var(--trk);border-radius:3px;overflow:hidden}
.lad .bar i{display:block;block-size:100%;border-radius:3px;background:var(--v);transition:inline-size .4s ease-out,background .3s}
.lad .p .bar i{background:var(--pl)}
.lad .cur.p .bar i{background:var(--p)}
.lad .r .bar i{background:repeating-linear-gradient(-45deg,var(--r) 0 3px,#C9655E 3px 6px)}
.lad .ct{text-align:end;font-weight:700}
.lad .p .ct{font-weight:500;color:var(--ink2)}
.lad .sl{font-size:var(--t1);color:var(--ink3);white-space:nowrap}
.lad .v0 .sl,.lad .v .sl{color:var(--v)}
.lad .v .sl{font-weight:700}
.lad .r .sl{color:var(--r);font-weight:700}
.lad .cur .sl{color:var(--ink);font-weight:700}
.lad .sub{font-size:var(--t1);color:var(--r);padding:0 8px 4px;padding-inline-start:38px}
.lad .sep{font-size:11px;font-weight:700;letter-spacing:.02em;color:var(--ink3);padding:12px 8px 4px;position:relative}
.lad .sep::before{content:"";position:absolute;inset-inline-start:-20px;top:0;bottom:0;border-inline-start:1px solid var(--ln2)}

.lad .lh,.lad .g{display:grid;grid-template-columns:48px minmax(0,1fr) 72px 72px 88px;gap:16px;align-items:center;padding:0 8px}
.lad .lh{font-size:11px;font-weight:700;color:var(--ink3);padding-bottom:8px;border-bottom:1px solid var(--ln2)}
.lad .lh span:nth-child(n+3){text-align:end}
.lad .g{min-block-size:40px;border-bottom:1px solid var(--ln)}
.lad .g.pick{cursor:pointer}
.lad .g.pick:hover{background:#F1EEE7}
.lad .g .gn{font-size:var(--t4);font-weight:800;color:var(--ink3)}
.lad .g.done .gn,.lad .g.now .gn{color:var(--ink)}
.lad .gb{display:flex;block-size:8px;border-radius:4px;overflow:hidden;background:var(--trk)}
.lad .gb .a{background:var(--v)}
.lad .gb .q{background:var(--pl)}
.lad .g .gv,.lad .g .gp{text-align:end;font-weight:600}
.lad .g .gp{color:var(--ink2);font-weight:500}
.lad .g .gs{text-align:end;font-size:var(--t1);color:var(--ink3)}
.lad .g.done .gs{color:var(--v);font-weight:600}
.lad .g.now{background:var(--cur);border-bottom-color:transparent}
.lad .g.now .gs{color:var(--ink);font-weight:700}
.lad .gx{background:var(--cur);border-bottom:1px solid var(--ln);padding:8px 8px 16px;margin-bottom:0}
.lad .gx .gt{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:var(--t2);color:var(--ink2);padding:4px 0 12px;border-top:1px solid #D9DEE8}
.lad .gx .gt b{color:var(--ink)}
.lad .gx .gt button{text-decoration:underline;text-underline-offset:3px;color:var(--ink2);font-size:var(--t2)}
.lad .gx .kids{margin-inline-start:8px}
.lad .gx .ln{grid-template-columns:18px minmax(110px,150px) minmax(0,1fr) 40px 70px}
.lad .gx .row.cur .ln{background:var(--wh)}
.lad .lnote{font-size:var(--t1);color:var(--ink3);margin-top:12px}
.lad .msg{padding:48px 0;text-align:center;color:var(--ink3)}

.lad .lay{position:fixed;inset:0;background:rgba(20,33,61,.28);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:grid;place-items:center;z-index:50;animation:lad-fi .18s ease-out}
@keyframes lad-fi{from{opacity:0}}
.lad .dlg{background:var(--sf);border-radius:var(--r2);padding:24px;inline-size:min(460px,calc(100% - 32px));box-shadow:0 24px 64px rgba(20,33,61,.22);animation:lad-up .22s ease-out}
.lad .dlg.wide{inline-size:min(760px,calc(100% - 32px));max-block-size:calc(100vh - 48px);overflow:auto}
@keyframes lad-up{from{transform:translateY(8px) scale(.98);opacity:0}}
.lad .dlg h3{font-size:var(--t5);font-weight:800;line-height:1.25;margin-bottom:12px}
.lad .dlg ul{list-style:none;border-block:1px solid var(--ln);padding:8px 0;margin-bottom:16px}
.lad .dlg li{display:flex;gap:12px;padding:6px 0;font-size:14px;color:var(--ink2)}
.lad .dlg li b{color:var(--ink);min-inline-size:72px}
.lad .dlg li.rd b{color:var(--r)}
.lad .dlg .acts{margin-top:0}
.lad .dlg .no.solid{background:var(--r);color:#fff;box-shadow:none}
.lad .dlg .hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}
.lad .dlg .hdr h3{margin:0}
.lad .x{inline-size:36px;block-size:36px;border-radius:var(--r1);display:grid;place-items:center;color:var(--ink3)}
.lad .x:hover{background:var(--bg)}
.lad .toast{position:fixed;bottom:24px;inset-inline-start:50%;transform:translateX(50%);background:var(--ink);color:#fff;border-radius:var(--r1);padding:8px 8px 8px 16px;padding-inline-start:16px;display:flex;align-items:center;gap:16px;font-size:14px;z-index:40;box-shadow:0 12px 32px rgba(20,33,61,.25);animation:lad-up .2s ease-out}
.lad .toast button{color:#fff;font-weight:700;padding:4px 12px;border-radius:4px;background:rgba(255,255,255,.12)}
.lad .keys{font-size:var(--t1);color:var(--ink3);margin-top:12px;text-align:center}

@media (max-width:760px){
  .lad{padding:12px 16px 48px}
  .lad .top{flex-direction:column-reverse;align-items:stretch;margin-bottom:20px}
  .lad .tools{justify-content:flex-end;padding:8px 0 4px}
  .lad .hd{flex-direction:column;align-items:stretch;gap:16px;margin-bottom:20px}
  .lad h1{font-size:var(--t6)}
  .lad .prog{text-align:start;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
  .lad .prog .big{font-size:var(--t6)}
  .lad .prog .lbl{margin:0}
  .lad .segs{flex:1 1 100%}
  .lad .segs button{flex:1}
  .lad .grid{grid-template-columns:1fr;gap:16px}
  .lad .card{position:static;padding:20px}
  .lad .viz{padding:16px}
  .lad .ph{margin-bottom:16px}
  .lad .ln{grid-template-columns:18px minmax(0,1fr) 40px;row-gap:4px;column-gap:8px;padding:6px 8px}
  .lad .ln .bar{grid-column:2/-1;grid-row:2}
  .lad .ln .sl{display:none}
  .lad .gx .ln{grid-template-columns:18px minmax(0,1fr) 40px}
  .lad .kids{margin-inline-start:12px;padding-inline-start:16px}
  .lad .row::before,.lad .row::after,.lad .sep::before{inset-inline-start:-16px}
  .lad .row::after{inline-size:22px}
  .lad .sub{padding-inline-start:34px}
  .lad .lh,.lad .g{grid-template-columns:28px minmax(0,1fr) 48px 52px;gap:8px;padding:0 4px}
  .lad .lh span:last-child,.lad .g .gs{display:none}
  .lad .gx{padding:8px 4px 12px}
  .lad .gx .kids{margin-inline-start:4px}
  .lad .toast{inline-size:calc(100% - 32px);justify-content:space-between}
}
@media (prefers-reduced-motion:reduce){
  .lad *,.lad *::before,.lad *::after{animation:none!important;transition:none!important}
}
`
