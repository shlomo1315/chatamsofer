// עיצוב מסך "המאושרים בעץ" — מועתק מהמוקאפ שאושר, ממוקד תחת .apv כדי לא להשפיע על שאר המסכים.
export const APPROVED_CSS = `
.apv{--bg:#F7F5F0;--sunk:#F1EEE7;--line:#E4DED2;--line-2:#CFC6B5;--ink:#14233b;--ink-2:#4F5868;--ink-3:#767C8A;--navy:#14233b;--navy-2:#22385a;--gold:#E3C98F;--ok:#2E6B4E;--ok-bg:#E6F0E9;--ok-line:#9CC3AC;--pend:#8A5A0B;--pend-bg:#FBF1DE;--pend-soft:#FFFBF3;--pend-line:#D9A94F;--red:#A8362B;--red-bg:#F8E4E0;
--t-xs:12px;--t-s:13.5px;--t-m:15px;--t-l:19px;--t-xl:24px;--t-2xl:30px;--t-3xl:44px;--s1:4px;--s2:8px;--s3:12px;--s4:16px;--s5:24px;--s6:32px;--s7:48px;--s8:64px;--r1:6px;--r2:12px;--ease:cubic-bezier(.2,.8,.2,1);
font-family:Heebo,system-ui,sans-serif;color:var(--ink);font-size:var(--t-m);line-height:1.5;-webkit-font-smoothing:antialiased;padding:var(--s6) var(--s6) var(--s8);min-width:0}
.apv *{box-sizing:border-box}
.apv button,.apv input,.apv select,.apv textarea{font:inherit;color:inherit}
.apv button{cursor:pointer;-webkit-tap-highlight-color:transparent}
.apv button:active:not(:disabled){transform:scale(.98)}
.apv button:disabled{cursor:not-allowed}
.apv :focus-visible{outline:2px solid var(--navy);outline-offset:2px}
.apv .num{font-variant-numeric:tabular-nums}
.apv kbd{font:600 11px/1 Heebo;border:1px solid currentColor;border-radius:4px;padding:2px 5px;opacity:.7}
.apv .head{display:flex;align-items:flex-end;gap:var(--s4);margin-bottom:var(--s5)}
.apv .head h1{margin:0;font-size:var(--t-2xl);font-weight:800;letter-spacing:-.02em;line-height:1.15}
.apv .head p{margin:var(--s1) 0 0;color:var(--ink-2);font-size:var(--t-s);max-width:60ch;text-wrap:balance}
.apv .head .grow{flex:1}
.apv .btn{display:inline-flex;align-items:center;justify-content:center;gap:var(--s2);border-radius:var(--r1);padding:10px var(--s4);font-weight:700;border:1px solid transparent;white-space:nowrap;transition:background .18s var(--ease),border-color .18s var(--ease)}
.apv .btn.pri{background:var(--navy);color:#fff}
.apv .btn.pri:hover{background:var(--navy-2)}
.apv .btn.pri:disabled{background:#9AA1AD}
.apv .btn.gh{background:#fff;border-color:var(--line)}
.apv .btn.gh:hover{border-color:var(--line-2)}
.apv .tiles{display:grid;grid-template-columns:repeat(5,1fr);gap:var(--s3)}
.apv .tile{all:unset;box-sizing:border-box;cursor:pointer;background:#fff;border:1px solid var(--line);border-radius:var(--r2);padding:var(--s3) var(--s4) var(--s4);display:flex;flex-direction:column;gap:2px;transition:border-color .18s var(--ease),background .18s var(--ease)}
.apv .tile:hover{border-color:var(--line-2)}
.apv .tile:focus-visible{outline:2px solid var(--navy);outline-offset:2px}
.apv .tile .g{font-size:var(--t-s);color:var(--ink-3);font-weight:600}
.apv .tile .n{font-size:var(--t-3xl);font-weight:800;line-height:1;letter-spacing:-.03em;margin:var(--s1) 0}
.apv .tile .n small{font-size:var(--t-s);font-weight:500;color:var(--ink-3);letter-spacing:0;margin-inline-start:var(--s1)}
.apv .tile .st{font-size:var(--t-s);font-weight:600;color:var(--pend)}
.apv .tile .st.done{color:var(--ok)}
.apv .tile .bar{height:4px;background:var(--sunk);border-radius:2px;overflow:hidden;margin-top:var(--s2)}
.apv .tile .bar i{display:block;height:100%;background:var(--ok);border-radius:2px;transition:width .4s var(--ease)}
.apv .tile.on{background:var(--navy);border-color:var(--navy);color:#fff}
.apv .tile.on .g,.apv .tile.on .n small{color:#9FB0C8}
.apv .tile.on .st{color:var(--gold)}
.apv .tile.on .st.done{color:#9FD3B5}
.apv .tile.on .bar{background:rgba(255,255,255,.12)}
.apv .tile.on .bar i{background:#7FC29C}
.apv .tools{display:flex;align-items:center;gap:var(--s3);flex-wrap:wrap;margin:var(--s5) 0 var(--s4)}
.apv .search{display:flex;align-items:center;gap:var(--s2);background:#fff;border:1px solid var(--line);border-radius:var(--r1);padding:0 var(--s3);height:36px;min-width:220px}
.apv .search input{border:0;outline:0;background:transparent;flex:1;font-size:var(--t-s);min-width:0}
.apv .search svg{width:16px;height:16px;color:var(--ink-3)}
.apv .chk{display:inline-flex;align-items:center;gap:var(--s2);font-size:var(--t-s);font-weight:500;color:var(--ink-2);cursor:pointer;user-select:none}
.apv .chk input{width:18px;height:18px;accent-color:var(--navy)}
.apv .legend{margin-inline-start:auto;display:flex;gap:var(--s4);font-size:var(--t-xs);color:var(--ink-3)}
.apv .legend span{display:inline-flex;align-items:center;gap:6px}
.apv .lg{width:12px;height:12px;border-radius:3px;display:inline-block}
.apv .lg.ok{background:var(--ok)}
.apv .lg.pend{border:1.5px dashed var(--pend-line);background:var(--pend-soft)}
.apv .lg.blk{border:1.5px dashed var(--line-2);background:var(--sunk)}
.apv .ap{border:1px solid var(--ok-line);background:var(--ok-bg);color:var(--ok);font-weight:700;font-size:var(--t-s);border-radius:var(--r1);padding:4px var(--s3);white-space:nowrap;transition:background .18s var(--ease)}
.apv .ap:hover{background:#D5E8DB}
.apv .ap:disabled{background:var(--sunk);border-color:var(--line);color:var(--ink-3)}
.apv .ad{border:1px dashed var(--line-2);background:transparent;color:var(--ink-2);font-weight:600;font-size:var(--t-xs);border-radius:var(--r1);padding:4px var(--s2);white-space:nowrap;opacity:0;transition:opacity .18s var(--ease),border-color .18s var(--ease)}
.apv .tn:hover .ad,.apv .tn:focus-within .ad{opacity:1}
.apv .ad:hover{border-color:var(--navy);color:var(--navy)}
.apv mark{background:#F6E2A8;color:inherit;border-radius:2px}
.apv .empty{padding:var(--s7) var(--s5);text-align:center;color:var(--ink-2)}
.apv .empty b{display:block;color:var(--ink);font-size:var(--t-l);margin-bottom:var(--s1)}
.apv .tbar{display:flex;align-items:center;gap:var(--s3);flex-wrap:wrap;background:#fff;border:1px solid var(--line);border-bottom:0;border-radius:var(--r2) var(--r2) 0 0;padding:var(--s3) var(--s4);font-size:var(--t-s);color:var(--ink-2)}
.apv .tbar b{color:var(--pend)}
.apv .tbar .btn{margin-inline-start:auto;padding:6px var(--s3);font-size:var(--t-s)}
.apv .tbar .hint{display:none;color:var(--ink-3)}
.apv .tw{background:#fff;border:1px solid var(--line);border-radius:0 0 var(--r2) var(--r2);overflow-x:auto;padding:var(--s4)}
.apv .tree{position:relative;margin-inline:auto}
.apv .band{position:absolute;top:0;bottom:0;border-radius:var(--r1);transition:background .2s var(--ease)}
.apv .band.on{background:#EEF2F7}
.apv .bh{all:unset;box-sizing:border-box;cursor:pointer;position:absolute;top:0;inset-inline:0;padding:6px var(--s2);display:flex;flex-direction:column;align-items:center;border-bottom:1px solid var(--line)}
.apv .bh b{font-size:var(--t-s);font-weight:800}
.apv .bh small{font-size:11.5px;color:var(--ink-3)}
.apv .bh small em{font-style:normal;color:var(--pend);font-weight:700}
.apv .band.on .bh{border-bottom-color:var(--navy)}
.apv .tree svg{position:absolute;inset:0;pointer-events:none;overflow:visible}
.apv .tn{position:absolute;background:#fff;border:1px solid var(--line-2);border-inline-start:3px solid var(--ok);border-radius:var(--r1);padding:7px 10px 6px;display:flex;flex-direction:column;transition:border-color .18s var(--ease),transform .18s var(--ease)}
.apv .tn:hover{border-color:var(--navy);border-inline-start-color:var(--ok)}
.apv .tn .t{font-weight:700;font-size:var(--t-s);line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.apv .tn .t.one{-webkit-line-clamp:1}
.apv .tn .s{font-size:11.5px;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.35}
.apv .tn .ft{overflow:hidden;display:flex;align-items:center;gap:6px;margin-top:auto;font-size:11.5px;color:var(--ink-3);white-space:nowrap}
.apv .tn .ft .ap,.apv .tn .ft .ad{margin-inline-start:auto;padding:1px var(--s2);font-size:11.5px}
.apv .tn.pend{border:1.5px dashed var(--pend-line);background:var(--pend-soft)}
.apv .tn.pend .ft{color:var(--pend);font-weight:600}
.apv .tn.blk{border:1.5px dashed var(--line-2);background:var(--sunk);color:var(--ink-3)}
.apv .tn.blk .t{font-weight:600}
.apv .tn.root{background:var(--navy);border-color:var(--navy);border-inline-start-color:var(--gold);color:#fff}
.apv .tn.root .ft,.apv .tn.root .s{color:#9FB0C8}
.apv .tn .tg{position:absolute;inset-inline-end:-12px;top:50%;margin-top:-12px;width:24px;height:24px;border-radius:50%;background:#fff;border:1px solid var(--line-2);font-size:11px;font-weight:800;color:var(--ink-2);padding:0;display:grid;place-items:center;z-index:2}
.apv .tn .tg:hover{border-color:var(--navy);color:var(--navy)}
.apv .tn .tg.c{background:var(--navy);border-color:var(--navy);color:#fff;width:auto;min-width:24px;padding:0 6px;border-radius:12px}
.apv .tn.flash{animation:apv-fl2 1.4s var(--ease)}
@keyframes apv-fl2{from{background:#CFE7D8;transform:scale(1.03)}}
.apv-ov{position:fixed;inset:0;background:rgba(20,35,59,.38);backdrop-filter:blur(6px) saturate(1.1);-webkit-backdrop-filter:blur(6px);display:grid;place-items:center;padding:16px;z-index:50;animation:apv-fi .2s cubic-bezier(.2,.8,.2,1);font-family:Heebo,system-ui,sans-serif;color:#14233b}
@keyframes apv-fi{from{opacity:0}}
.apv-ov *{box-sizing:border-box}
.apv-ov button,.apv-ov select,.apv-ov textarea{font:inherit;color:inherit}
.apv-ov .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:6px;padding:10px 16px;font-weight:700;border:1px solid transparent;white-space:nowrap;cursor:pointer}
.apv-ov .btn.pri{background:#14233b;color:#fff}
.apv-ov .btn.pri:hover{background:#22385a}
.apv-ov .btn.pri:disabled{background:#9AA1AD;cursor:not-allowed}
.apv-ov .btn.gh{background:#fff;border-color:#E4DED2}
.apv-ov .md{background:#fff;border-radius:12px;width:min(640px,100%);max-height:calc(100vh - 32px);overflow:auto;padding:24px;box-shadow:0 24px 64px rgba(20,35,59,.28);animation:apv-pop .22s cubic-bezier(.2,.8,.2,1)}
@keyframes apv-pop{from{transform:translateY(8px) scale(.98);opacity:0}}
.apv-ov .md header{display:flex;align-items:flex-start;gap:12px;margin-bottom:16px}
.apv-ov .md h2{margin:0;font-size:24px;font-weight:800;line-height:1.2}
.apv-ov .md header p{margin:2px 0 0;font-size:13.5px;color:#4F5868}
.apv-ov .x{margin-inline-start:auto;border:0;background:#F1EEE7;width:36px;height:36px;border-radius:50%;font-size:20px;line-height:1;flex:none;cursor:pointer}
.apv-ov .fr{display:grid;grid-template-columns:140px 1fr;gap:12px;margin-bottom:12px}
.apv-ov .fl{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:700;color:#4F5868}
.apv-ov .fl select,.apv-ov .fl textarea{border:1px solid #CFC6B5;border-radius:6px;background:#fff;padding:9px 12px;font-size:15px;font-weight:500;color:#14233b}
.apv-ov .fl textarea{min-height:120px;resize:vertical;line-height:1.6}
.apv-ov .pv{border:1px solid #E4DED2;border-radius:6px;margin-top:12px;overflow:hidden}
.apv-ov .pv h3{margin:0;padding:8px 12px;font-size:12px;font-weight:700;color:#767C8A;background:#F1EEE7;border-bottom:1px solid #E4DED2}
.apv-ov .pr{display:flex;align-items:center;gap:12px;padding:8px 12px;border-bottom:1px solid #EFEBE3;font-size:13.5px}
.apv-ov .pr:last-child{border-bottom:0}
.apv-ov .pr span:first-child{flex:1;font-weight:600}
.apv-ov .pill{font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px;white-space:nowrap}
.apv-ov .pill.found{background:#E6F0E9;color:#2E6B4E}
.apv-ov .pill.new{background:#E8EEF7;color:#22385a}
.apv-ov .pill.red{background:#F8E4E0;color:#A8362B}
.apv-ov .pill.skip{background:#F1EEE7;color:#767C8A}
.apv-ov .md footer{display:flex;align-items:center;gap:12px;margin-top:24px}
.apv-ov .md footer .sum{font-size:12px;color:#767C8A;flex:1}
.apv-ov kbd{font:600 11px/1 Heebo;border:1px solid currentColor;border-radius:4px;padding:2px 5px;opacity:.7}
.apv-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#14233b;color:#fff;border-radius:12px;padding:12px 16px;display:flex;align-items:center;gap:16px;font:500 13.5px Heebo,system-ui,sans-serif;box-shadow:0 12px 32px rgba(20,35,59,.3);z-index:60;overflow:hidden;animation:apv-tin .25s cubic-bezier(.2,.8,.2,1);max-width:calc(100% - 32px)}
@keyframes apv-tin{from{transform:translate(-50%,12px);opacity:0}}
.apv-toast button{border:0;background:transparent;color:#E3C98F;font:800 13.5px Heebo,system-ui,sans-serif;padding:4px;cursor:pointer}
.apv-toast i{position:absolute;bottom:0;right:0;height:2px;background:#E3C98F;animation:apv-tm 10s linear forwards}
@keyframes apv-tm{from{width:100%}to{width:0}}
@media (max-width:720px){
.apv{padding:var(--s5) var(--s4) var(--s8)}
.apv .head{flex-direction:column;align-items:stretch;gap:var(--s3)}
.apv .head h1{font-size:var(--t-xl)}
.apv .head .btn{width:100%;padding:12px}
.apv .tiles{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;margin-inline:calc(var(--s4) * -1);padding-inline:var(--s4);scrollbar-width:none}
.apv .tile{flex:0 0 128px;scroll-snap-align:start}
.apv .tile .n{font-size:36px}
.apv .tools{gap:var(--s2)}
.apv .search{width:100%;min-width:0;height:44px}
.apv .legend{display:none}
.apv .ad{opacity:1;padding:var(--s2) 10px}
.apv .ap{padding:var(--s2) var(--s3)}
.apv .tbar .hint{display:inline}
.apv .tbar .btn{margin-inline-start:0}
.apv .tw{padding:var(--s3)}
.apv-ov .fr{grid-template-columns:1fr}
.apv-ov .md{padding:16px}
.apv-ov .md footer{flex-wrap:wrap}
.apv-ov .md footer .sum{flex-basis:100%}
.apv-ov .md footer .btn{flex:1}
}
@media (prefers-reduced-motion:reduce){.apv *,.apv-ov *,.apv-toast,.apv-toast *{animation:none!important;transition:none!important}}
`
