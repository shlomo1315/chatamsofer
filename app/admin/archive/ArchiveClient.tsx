'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  ArrowRight, Check, ChevronLeft, ChevronRight, Download, FolderOpen, LayoutGrid, List, Play,
  Search, Upload, Zap, X, AlertTriangle,
} from 'lucide-react'
import {
  ARCHIVE_EVENT_TYPES, detectKind, eventTypeColor, filterEvents, formatBytes, formatDuration,
  groupByYear, hebrewFromIso, latestEvent, type ArchiveEvent, type ArchiveFile,
} from '@/lib/archive'
import './archive.css'

const API = '/api/admin/archive'
const thumbUrl = (id: string) => `${API}/files/${id}/thumb`
const mediaUrl = (id: string, download = false) => `${API}/files/${id}/media${download ? '?download=1' : ''}`
const gradient = (type: string): CSSProperties => ({ ['--g' as string]: `linear-gradient(135deg, ${eventTypeColor(type)}, #1e3a8a 90%)` })

type View = 'home' | 'event' | 'upload'
type DriveJob = { id: string; state: 'running' | 'done' | 'error'; total: number; done: number; failed: number; error: string | null; lastError: string | null }
type Picked = { file: File; kind: 'image' | 'video'; path: string }

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error || `שגיאה (${res.status})`)
  return body as T
}

// ───── מוקטן בדפדפן: תמונה → canvas; סרטון → פריים. נשלח לשרת ונשמר שם, כך שלא תלוי ב-Google ===
async function makeThumb(file: File, kind: 'image' | 'video'): Promise<{ blob: Blob | null; w: number | null; h: number | null; dur: number | null }> {
  const MAX = 480
  const draw = (src: CanvasImageSource, sw: number, sh: number) => new Promise<Blob | null>(resolve => {
    const s = Math.min(1, MAX / Math.max(sw, sh))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(sw * s)); c.height = Math.max(1, Math.round(sh * s))
    c.getContext('2d')?.drawImage(src, 0, 0, c.width, c.height)
    c.toBlob(b => resolve(b), 'image/jpeg', 0.78)
  })
  try {
    if (kind === 'image') {
      const bmp = await createImageBitmap(file)
      const blob = await draw(bmp, bmp.width, bmp.height)
      const r = { blob, w: bmp.width, h: bmp.height, dur: null }
      bmp.close()
      return r
    }
    const url = URL.createObjectURL(file)
    try {
      const v = document.createElement('video')
      v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = url
      await new Promise<void>((ok, bad) => { v.onloadeddata = () => ok(); v.onerror = () => bad(new Error('video')); setTimeout(() => bad(new Error('timeout')), 10000) })
      const dur = Number.isFinite(v.duration) ? Math.round(v.duration) : null
      v.currentTime = Math.min(1, (v.duration || 2) / 2)
      await new Promise<void>(ok => { v.onseeked = () => ok(); setTimeout(ok, 3000) })
      const blob = await draw(v, v.videoWidth || 640, v.videoHeight || 360)
      return { blob, w: v.videoWidth || null, h: v.videoHeight || null, dur }
    } finally { URL.revokeObjectURL(url) }
  } catch {
    return { blob: null, w: null, h: null, dur: null } // פורמט שהדפדפן לא קורא (למשל HEIC) — השרת ינסה ליצור מוקטן בעצמו בצפייה
  }
}

// גרירת תיקיות: קריאה רקורסיבית של FileSystemEntry
type FsEntry = { isFile: boolean; isDirectory: boolean; name: string; file?: (cb: (f: File) => void) => void; createReader?: () => { readEntries: (cb: (e: FsEntry[]) => void) => void } }
async function readEntry(entry: FsEntry, prefix: string, out: Picked[]): Promise<void> {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>(r => entry.file!(r))
    const kind = detectKind(file.name, file.type)
    if (kind) out.push({ file, kind, path: prefix + file.name })
  } else if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader()
    for (;;) {
      const batch = await new Promise<FsEntry[]>(r => reader.readEntries(r))
      if (!batch.length) break
      for (const e of batch) await readEntry(e, `${prefix}${entry.name}/`, out)
    }
  }
}

export default function ArchiveClient({ initialEvents, canAdd, canEdit, driveConnected, loadError }: {
  initialEvents: ArchiveEvent[]; canAdd: boolean; canEdit: boolean; driveConnected: boolean; loadError: string | null
}) {
  const [events, setEvents] = useState(initialEvents)
  const [view, setView] = useState<View>('home')
  const [filters, setFilters] = useState<{ year: string | null; type: string | null; q: string }>({ year: null, type: null, q: '' })
  const [layout, setLayout] = useState<'cards' | 'list'>('cards')
  const [current, setCurrent] = useState<ArchiveEvent | null>(null)
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)

  const say = useCallback((msg: string, bad = false) => {
    setToast({ msg, bad })
    setTimeout(() => setToast(null), 3500)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(t.tagName)) { e.preventDefault(); searchRef.current?.focus() }
    }
    const onScroll = () => setStuck((barRef.current?.getBoundingClientRect().top ?? 1) <= 1)
    window.addEventListener('keydown', onKey); window.addEventListener('scroll', onScroll, true)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('scroll', onScroll, true) }
  }, [])

  const years = useMemo(() => groupByYear(events), [events])
  const visible = useMemo(() => filterEvents(events, filters), [events, filters])
  const visibleByYear = useMemo(() => groupByYear(visible), [visible])
  const latest = useMemo(() => latestEvent(events), [events])

  const open = (ev: ArchiveEvent) => { setCurrent(ev); setView('event'); window.scrollTo({ top: 0 }) }
  const upsert = (ev: ArchiveEvent) => setEvents(list => {
    const rest = list.filter(e => e.id !== ev.id)
    return [...rest, ev].sort((a, b) => b.event_date.localeCompare(a.event_date))
  })

  return (
    <div className="arc" dir="rtl">
      {loadError && <div className="err" role="alert">{loadError}</div>}

      {view === 'home' && (
        <section style={{ animation: 'arcIn .35s var(--ease)' }}>
          <div className="hero">
            {latest ? (
              <div className="ph feat" style={gradient(latest.event_type)} role="button" tabIndex={0}
                onClick={() => open(latest)} onKeyDown={e => e.key === 'Enter' && open(latest)}>
                {latest.cover_file_ids[0] && <img src={thumbUrl(latest.cover_file_ids[0])} alt="" />}
                <div className="shade" />
                <span className="kick">האירוע האחרון</span>
                <h1>{latest.name}</h1>
                <p>{latest.hebrew_date} · {latest.photo_count} תמונות · {latest.video_count} סרטונים</p>
              </div>
            ) : (
              <div className="ph feat" style={gradient('אחר')}><div className="shade" /><h1>עוד אין אירועים בארכיון</h1><p>אפשר להתחיל בהעלאת האירוע הראשון</p></div>
            )}
            <div className="side">
              <div className="box titlebox">
                <h2>ארכיון</h2>
                <div className="sub">כל המעמדים והאירועים, במקום אחד</div>
                {canAdd && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                    <button className="btn" onClick={() => setView('upload')}><Upload />העלאת אירוע</button>
                  </div>
                )}
              </div>
              <div className="box fast">
                <div className="ic"><Zap size={22} /></div>
                <div>
                  <b>התמונות נטענות מיד, גם בנטפרי</b>
                  <span>הקבצים שמורים ב-Drive ומוצגים דרך האתר שלנו</span><br />
                  {driveConnected
                    ? <span className="pill"><i />מחובר ל-Drive</span>
                    : <span className="pill" style={{ color: '#991b1b', background: '#fef2f2', borderColor: '#fecaca' }}>Drive לא מחובר</span>}
                </div>
              </div>
            </div>
          </div>

          <div className={`bar${stuck ? ' stuck' : ''}`} ref={barRef}>
            <div className="searchrow">
              <label className="search">
                <Search size={19} />
                <input ref={searchRef} value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))}
                  placeholder="חפש אירוע, מקום או תיאור…" aria-label="חיפוש בארכיון" />
                <kbd>/</kbd>
              </label>
              <div className="seg">
                <button className={layout === 'cards' ? 'on' : ''} title="כרטיסים" aria-label="כרטיסים" onClick={() => setLayout('cards')}><LayoutGrid size={18} /></button>
                <button className={layout === 'list' ? 'on' : ''} title="רשימה" aria-label="רשימה" onClick={() => setLayout('list')}><List size={18} /></button>
              </div>
            </div>
            <div className="timeline">
              <button className={`yr${filters.year === null ? ' on' : ''}`} onClick={() => setFilters(f => ({ ...f, year: null }))}>
                <b>הכול</b><small>{events.length} אירועים</small>
              </button>
              {years.map(y => (
                <button key={y.year} className={`yr${filters.year === y.year ? ' on' : ''}`}
                  onClick={() => setFilters(f => ({ ...f, year: f.year === y.year ? null : y.year }))}>
                  <b>{y.year}</b><small>{y.events.length} אירועים</small>
                </button>
              ))}
            </div>
            <div className="types">
              {ARCHIVE_EVENT_TYPES.map(t => (
                <button key={t.name} className={`chip${filters.type === t.name ? ' on' : ''}`}
                  onClick={() => setFilters(f => ({ ...f, type: f.type === t.name ? null : t.name }))}>
                  <span className="dot" style={{ ['--c' as string]: t.color }} />{t.name}
                </button>
              ))}
            </div>
          </div>

          <div className="count">{visible.length} אירועים</div>
          {visible.length === 0 && (
            <div className="empty"><b>לא נמצאו אירועים</b>נסה לנקות את הסינון או לשנות את החיפוש</div>
          )}
          {visibleByYear.map(g => (
            <div key={g.year}>
              <div className="yearhead"><h3>{g.year}</h3><span>{g.events.length} אירועים</span></div>
              {layout === 'cards' ? (
                <div className="grid">
                  {g.events.map((ev, i) => (
                    <button key={ev.id} className="card" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }} onClick={() => open(ev)}>
                      <div className="stack">
                        {[0, 1, 2].map(n => (
                          <div key={n} className="ph" style={gradient(ev.event_type)}>
                            {ev.cover_file_ids[n] && <img src={thumbUrl(ev.cover_file_ids[n])} alt="" loading="lazy" />}
                          </div>
                        ))}
                        <div className="badge"><span>{ev.photo_count} תמונות</span>{ev.video_count > 0 && <span>{ev.video_count} סרטונים</span>}</div>
                      </div>
                      <div className="body">
                        <span className="tag"><span className="dot" style={{ ['--c' as string]: eventTypeColor(ev.event_type) }} />{ev.event_type}</span>
                        <h4>{ev.name}</h4>
                        <div className="meta">{ev.hebrew_date}{ev.place ? ` · ${ev.place}` : ''}</div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : g.events.map(ev => (
                <button key={ev.id} className="listrow" onClick={() => open(ev)}>
                  <div className="ph" style={gradient(ev.event_type)}>{ev.cover_file_ids[0] && <img src={thumbUrl(ev.cover_file_ids[0])} alt="" loading="lazy" />}</div>
                  <div><b>{ev.name}</b><small>{ev.event_type} · {ev.hebrew_date} · {ev.photo_count} תמונות · {ev.video_count} סרטונים</small></div>
                </button>
              ))}
            </div>
          ))}
        </section>
      )}

      {view === 'event' && current && (
        <EventView
          event={current} canAdd={canAdd} canEdit={canEdit} say={say}
          onBack={() => setView('home')}
          onAdd={() => setView('upload')}
          onChanged={ev => { upsert(ev); setCurrent(ev) }}
          onDeleted={id => { setEvents(l => l.filter(e => e.id !== id)); setView('home') }}
        />
      )}

      {view === 'upload' && (
        <UploadView
          events={events} presetEvent={current} say={say} driveConnected={driveConnected}
          onCancel={() => setView(current ? 'event' : 'home')}
          onDone={ev => { upsert(ev); setCurrent(ev); setView('event'); window.scrollTo({ top: 0 }) }}
        />
      )}

      <div className={`toast${toast ? ' on' : ''}${toast?.bad ? ' bad' : ''}`} role="status" aria-live="polite">
        {toast?.bad ? <AlertTriangle size={18} /> : <Check size={18} />}{toast?.msg}
      </div>
    </div>
  )
}

// ═════════ תוך אירוע ═════════
function EventView({ event, canAdd, canEdit, say, onBack, onAdd, onChanged, onDeleted }: {
  event: ArchiveEvent; canAdd: boolean; canEdit: boolean; say: (m: string, bad?: boolean) => void
  onBack: () => void; onAdd: () => void; onChanged: (e: ArchiveEvent) => void; onDeleted: (id: string) => void
}) {
  const [files, setFiles] = useState<ArchiveFile[] | null>(null)
  const [tab, setTab] = useState<'all' | 'image' | 'video'>('all')
  const [lb, setLb] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    let alive = true
    api<{ files: ArchiveFile[] }>(`${API}/events/${event.id}/files`)
      .then(r => alive && setFiles(r.files))
      .catch(e => { if (alive) { setFiles([]); say(e.message, true) } })
    return () => { alive = false }
  }, [event.id, say])

  const shown = useMemo(() => (files ?? []).filter(f => tab === 'all' || f.kind === tab), [files, tab])
  const photos = (files ?? []).filter(f => f.kind === 'image').length
  const videos = (files ?? []).filter(f => f.kind === 'video').length

  const downloadAll = async () => {
    const list = files ?? []
    if (list.length > 10 && !confirm(`להוריד ${list.length} קבצים? הדפדפן עשוי לבקש אישור להורדות מרובות.`)) return
    for (const f of list) {
      const a = document.createElement('a')
      a.href = mediaUrl(f.id, true); a.download = f.name
      document.body.appendChild(a); a.click(); a.remove()
      await new Promise(r => setTimeout(r, 400))
    }
  }

  const removeFile = async (f: ArchiveFile) => {
    if (!confirm(`למחוק את "${f.name}"? הקובץ יימחק גם מ-Drive.`)) return
    try {
      await api(`${API}/files/${f.id}`, { method: 'DELETE' })
      setFiles(l => (l ?? []).filter(x => x.id !== f.id)); setLb(null)
      const r = await api<{ event: ArchiveEvent }>(`${API}/events/${event.id}/files`, { method: 'PUT' })
      onChanged(r.event); say('הקובץ נמחק')
    } catch (e) { say((e as Error).message, true) }
  }

  const dateText = event.event_date.split('-').reverse().join('.')

  return (
    <section style={{ animation: 'arcIn .35s var(--ease)' }}>
      <button className="back" onClick={onBack}><ChevronRight size={16} />כל הארכיון</button>
      <div className="ph cover" style={gradient(event.event_type)}>
        {event.cover_file_ids[0] && <img src={thumbUrl(event.cover_file_ids[0])} alt="" />}
        <div className="shade" />
        <div>
          <span className="tag" style={{ color: '#e4e4e7' }}><span className="dot" style={{ ['--c' as string]: eventTypeColor(event.event_type) }} />{event.event_type}</span>
          <h2>{event.name}</h2>
          <p>{event.hebrew_date} · {dateText} · {event.place || '[להשלים: מקום]'}</p>
          {event.description && <p style={{ marginTop: 4, fontSize: 14 }}>{event.description}</p>}
        </div>
        <div className="acts">
          {canAdd && <button onClick={onAdd}>הוספת קבצים</button>}
          <button onClick={downloadAll} disabled={!files?.length}>הורדת הכול</button>
          {canEdit && <button onClick={() => setEditing(true)}>עריכת פרטים</button>}
        </div>
      </div>

      <div className="tabs">
        <button className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>הכול · {photos + videos}</button>
        <button className={tab === 'image' ? 'on' : ''} onClick={() => setTab('image')}>תמונות · {photos}</button>
        <button className={tab === 'video' ? 'on' : ''} onClick={() => setTab('video')}>סרטונים · {videos}</button>
      </div>

      {files === null && <div className="empty">טוען…</div>}
      {files !== null && shown.length === 0 && <div className="empty"><b>אין עדיין קבצים</b>אפשר להוסיף קבצים לאירוע הזה</div>}
      <div className="masonry">
        {shown.map((f, i) => (
          <div key={f.id} className="ph tile" style={{ ...gradient(event.event_type), aspectRatio: f.width && f.height ? `${f.width}/${f.height}` : '4/3' }}
            role="button" tabIndex={0} aria-label={f.name} onClick={() => setLb(i)} onKeyDown={e => e.key === 'Enter' && setLb(i)}>
            <img src={thumbUrl(f.id)} alt={f.name} loading="lazy" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
            {f.kind === 'video' && <>
              <div className="play"><i><Play size={20} fill="currentColor" /></i></div>
              {f.duration_sec ? <span className="dur">{formatDuration(f.duration_sec)}</span> : null}
            </>}
          </div>
        ))}
      </div>

      {lb !== null && shown[lb] && (
        <Lightbox files={shown} index={lb} setIndex={setLb} event={event} canEdit={canEdit} onRemove={removeFile} />
      )}
      {editing && <EditDialog event={event} onClose={() => setEditing(false)} say={say}
        onSaved={e => { onChanged(e); setEditing(false); say('הפרטים נשמרו') }} onDeleted={() => onDeleted(event.id)} />}
    </section>
  )
}

function Lightbox({ files, index, setIndex, event, canEdit, onRemove }: {
  files: ArchiveFile[]; index: number; setIndex: (i: number | null) => void; event: ArchiveEvent
  canEdit: boolean; onRemove: (f: ArchiveFile) => void
}) {
  const f = files[index]
  const go = useCallback((d: number) => setIndex((index + d + files.length) % files.length), [index, files.length, setIndex])
  const touch = useRef<number | null>(null)
  const stripRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIndex(null)
      // במסך RTL החץ השמאלי מקדם קדימה
      if (e.key === 'ArrowLeft') go(1)
      if (e.key === 'ArrowRight') go(-1)
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [go, setIndex])

  useEffect(() => {
    stripRef.current?.querySelector('button.on')?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [index])

  return (
    <div className="lb on" role="dialog" aria-modal="true" aria-label={f.name}>
      <div className="top">
        <span>{index + 1} / {files.length} · {event.name} · {f.name} · {formatBytes(f.size_bytes ?? 0)}</span>
        <div className="r">
          <a href={mediaUrl(f.id, true)} download={f.name} style={{ color: '#fff', border: '1px solid rgba(255,255,255,.22)', borderRadius: 10, padding: '7px 12px', minHeight: 40, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Download size={16} />הורדה</a>
          {f.drive_file_id && <a href={`https://drive.google.com/file/d/${f.drive_file_id}/view`} target="_blank" rel="noreferrer"
            style={{ color: '#fff', border: '1px solid rgba(255,255,255,.22)', borderRadius: 10, padding: '7px 12px', minHeight: 40, display: 'inline-flex', alignItems: 'center', gap: 6 }}><FolderOpen size={16} />פתיחה ב-Drive</a>}
          {canEdit && <button onClick={() => onRemove(f)}>מחיקה</button>}
          <button onClick={() => setIndex(null)} aria-label="סגירה"><X size={18} /></button>
        </div>
      </div>
      <div className="stage"
        onTouchStart={e => { touch.current = e.touches[0].clientX }}
        onTouchEnd={e => {
          if (touch.current === null) return
          const dx = e.changedTouches[0].clientX - touch.current
          if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1)
          touch.current = null
        }}>
        <button className="nav prev" onClick={() => go(-1)} aria-label="הקודם"><ChevronRight /></button>
        <div className="big" style={{ width: 'min(900px,100%)', height: 'min(70vh, 100%)' }}>
          {f.kind === 'image'
            ? <img key={f.id} src={thumbUrl(f.id)} alt={f.name} onLoad={e => {
                // החלפה לקובץ המקורי אחרי שהמוקטן כבר מוצג — תצוגה מיידית ואז חדות מלאה
                const el = e.currentTarget; if (!el.dataset.full) { el.dataset.full = '1'; const full = new Image(); full.onload = () => { el.src = full.src }; full.src = mediaUrl(f.id) }
              }} />
            : <video key={f.id} src={mediaUrl(f.id)} poster={thumbUrl(f.id)} controls playsInline preload="none" />}
        </div>
        <button className="nav next" onClick={() => go(1)} aria-label="הבא"><ChevronLeft /></button>
      </div>
      <div className="strip" ref={stripRef}>
        {files.map((x, i) => (
          <button key={x.id} className={`ph${i === index ? ' on' : ''}`} style={gradient(event.event_type)} onClick={() => setIndex(i)} aria-label={x.name}>
            <img src={thumbUrl(x.id)} alt="" loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  )
}

function EditDialog({ event, onClose, onSaved, onDeleted, say }: {
  event: ArchiveEvent; onClose: () => void; onSaved: (e: ArchiveEvent) => void; onDeleted: () => void; say: (m: string, bad?: boolean) => void
}) {
  const [f, setF] = useState({ name: event.name, event_date: event.event_date, event_type: event.event_type, place: event.place ?? '', description: event.description ?? '' })
  const [busy, setBusy] = useState(false)
  const heb = hebrewFromIso(f.event_date)
  const save = async () => {
    setBusy(true)
    try { onSaved((await api<{ event: ArchiveEvent }>(`${API}/events/${event.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })).event) }
    catch (e) { say((e as Error).message, true); setBusy(false) }
  }
  const del = async () => {
    if (!confirm('למחוק את האירוע וכל הקבצים שלו (גם מ-Drive)? אי אפשר לשחזר.')) return
    setBusy(true)
    try { await api(`${API}/events/${event.id}`, { method: 'DELETE' }); onDeleted() }
    catch (e) { say((e as Error).message, true); setBusy(false) }
  }
  return (
    <div className="modal" onClick={onClose}>
      <div className="panel" role="dialog" aria-modal="true" aria-label="עריכת פרטים" onClick={e => e.stopPropagation()}>
        <h3 style={{ marginBottom: 14 }}>עריכת פרטי אירוע</h3>
        <EventFields f={f} setF={setF} heb={heb?.date ?? null} />
        <div className="actions" style={{ justifyContent: 'space-between' }}>
          <button className="btn danger" onClick={del} disabled={busy}>מחיקת אירוע</button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn ghost" onClick={onClose}>ביטול</button>
            <button className="btn" onClick={save} disabled={busy || !f.name.trim() || !heb}>שמירה</button>
          </div>
        </div>
      </div>
    </div>
  )
}

type Fields = { name: string; event_date: string; event_type: string; place: string; description: string }
function EventFields({ f, setF, heb, hideName }: { f: Fields; setF: (v: Fields) => void; heb: string | null; hideName?: boolean }) {
  return <>
    {!hideName && <div className="field"><label htmlFor="evname">שם האירוע <em>*</em></label>
      <input id="evname" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="למשל: הילולת מרן החתם סופר" /></div>}
    <div className="row2">
      <div className="field"><label htmlFor="evdate">תאריך <em>*</em></label>
        <input type="date" id="evdate" value={f.event_date} onChange={e => setF({ ...f, event_date: e.target.value })} />
        <div className="small he">{heb ?? 'תאריך לא תקין'}</div></div>
      <div className="field"><label htmlFor="evplace">מקום</label>
        <input id="evplace" value={f.place} onChange={e => setF({ ...f, place: e.target.value })} placeholder="[להשלים]" /></div>
    </div>
    <div className="field"><label>סוג אירוע <em>*</em></label>
      <div className="typepick">
        {ARCHIVE_EVENT_TYPES.map(t => (
          <button key={t.name} type="button" className={`chip${f.event_type === t.name ? ' on' : ''}`} onClick={() => setF({ ...f, event_type: t.name })}>
            <span className="dot" style={{ ['--c' as string]: t.color }} />{t.name}
          </button>
        ))}
      </div></div>
    <div className="field"><label htmlFor="evdesc">תיאור קצר</label>
      <textarea id="evdesc" rows={2} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} placeholder="מה היה באירוע, מי השתתף…" /></div>
  </>
}

// ═════════ העלאה ═════════
function UploadView({ events, presetEvent, say, driveConnected, onCancel, onDone }: {
  events: ArchiveEvent[]; presetEvent: ArchiveEvent | null; say: (m: string, bad?: boolean) => void
  driveConnected: boolean; onCancel: () => void; onDone: (e: ArchiveEvent) => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [picked, setPicked] = useState<Picked[]>([])
  const [folderName, setFolderName] = useState('')
  const [existing, setExisting] = useState<ArchiveEvent | null>(presetEvent)
  const [f, setF] = useState<Fields>({ name: '', event_date: today, event_type: 'אחר', place: '', description: '' })
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [prog, setProg] = useState({ done: 0, total: 0, bytes: 0, totalBytes: 0 })
  const [err, setErr] = useState<string | null>(null)
  const [link, setLink] = useState('')
  const [checking, setChecking] = useState(false)
  const [drive, setDrive] = useState<{ url: string; name: string; photos: number; videos: number; bytes: number } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const dirInput = useRef<HTMLInputElement>(null)
  const heb = hebrewFromIso(f.event_date)

  const checkLink = async () => {
    setChecking(true); setErr(null)
    try {
      const r = await api<{ name: string; photos: number; videos: number; bytes: number }>(`${API}/import/preview`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: link }),
      })
      if (!r.photos && !r.videos) { setErr('לא נמצאו בתיקייה תמונות או סרטונים'); return }
      setPicked([]); setFolderName(r.name)
      setDrive({ url: link.trim(), ...r })
      if (!f.name && !existing) setF(v => ({ ...v, name: r.name }))
    } catch (e) { setErr((e as Error).message) } finally { setChecking(false) }
  }

  const add = (items: Picked[], folder?: string) => {
    setDrive(null)
    setPicked(p => [...p, ...items])
    if (folder && !f.name && !existing) { setFolderName(folder); setF(v => ({ ...v, name: folder })) }
  }
  const fromFileList = (list: FileList | null) => {
    if (!list) return
    const items: Picked[] = []
    let folder = ''
    for (const file of Array.from(list)) {
      const kind = detectKind(file.name, file.type)
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
      if (rel.includes('/') && !folder) folder = rel.split('/')[0]
      if (kind) items.push({ file, kind, path: rel })
    }
    add(items, folder)
  }
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setOver(false)
    const entries = Array.from(e.dataTransfer.items ?? []).map(i => (i as DataTransferItem & { webkitGetAsEntry?: () => FsEntry | null }).webkitGetAsEntry?.()).filter(Boolean) as FsEntry[]
    if (!entries.length) { fromFileList(e.dataTransfer.files); return }
    const out: Picked[] = []
    for (const en of entries) await readEntry(en, '', out)
    add(out, entries.find(x => x.isDirectory)?.name)
  }

  const previews = useMemo(() => picked.filter(p => p.kind === 'image').slice(0, 11).map(p => URL.createObjectURL(p.file)), [picked])
  useEffect(() => () => previews.forEach(u => URL.revokeObjectURL(u)), [previews])

  const photos = picked.filter(p => p.kind === 'image').length
  const videos = picked.length - photos
  const totalBytes = picked.reduce((s, p) => s + p.file.size, 0)
  const hasSource = picked.length > 0 || !!drive
  const step = busy ? 3 : hasSource ? 2 : 1
  const canSave = driveConnected && !busy && hasSource && (existing || (f.name.trim() && heb))

  const save = async () => {
    setBusy(true); setErr(null)
    let ev: ArchiveEvent
    try {
      ev = existing ?? (await api<{ event: ArchiveEvent }>(`${API}/events`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f),
      })).event
    } catch (e) { setErr((e as Error).message); setBusy(false); return }

    if (drive) {
      try {
        const start = await api<{ job: DriveJob }>(`${API}/events/${ev.id}/import`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: drive.url }),
        })
        let job = start.job
        setProg({ done: job.done, total: job.total, bytes: job.done, totalBytes: job.total })
        while (job.state === 'running') {
          await new Promise(r => setTimeout(r, 2000))
          job = (await api<{ job: DriveJob }>(`${API}/events/${ev.id}/import?job=${job.id}`)).job
          setProg({ done: job.done, total: job.total, bytes: job.done, totalBytes: job.total })
        }
        if (job.state === 'error') throw new Error(job.error || 'השאיבה נכשלה')
        if (job.lastError) setErr(`${job.failed} קבצים נכשלו. לדוגמה: ${job.lastError}`)
        const imported = job.total - job.failed
        const r = await api<{ event: ArchiveEvent }>(`${API}/events/${ev.id}/files`, { method: 'PUT' })
        say(job.failed ? `יובאו ${imported} מתוך ${job.total} קבצים` : job.total ? `יובאו ${imported} קבצים מ-Drive` : 'כל הקבצים כבר קיימים באירוע', job.failed > 0)
        onDone(r.event)
      } catch (e) { setErr((e as Error).message); setBusy(false) }
      return
    }
    const queue = [...picked]
    let done = 0, bytes = 0, failed = 0
    setProg({ done: 0, total: queue.length, bytes: 0, totalBytes })
    // שני קבצים במקביל: מספיק לניצול הרשת בלי להעמיס על השרת
    const worker = async () => {
      for (let p = queue.shift(); p; p = queue.shift()) {
        try {
          const t = await makeThumb(p.file, p.kind)
          const qs = new URLSearchParams({ name: p.file.name })
          if (t.w) qs.set('w', String(t.w)); if (t.h) qs.set('h', String(t.h)); if (t.dur) qs.set('dur', String(t.dur))
          const r = await api<{ file: ArchiveFile }>(`${API}/events/${ev.id}/files?${qs}`, {
            method: 'POST', headers: { 'Content-Type': p.file.type || 'application/octet-stream' }, body: p.file,
          })
          if (t.blob) await fetch(thumbUrl(r.file.id), { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: t.blob }).catch(() => {})
        } catch (e) { failed++; setErr(`${p.file.name}: ${(e as Error).message}`) }
        done++; bytes += p.file.size
        setProg({ done, total: picked.length, bytes, totalBytes })
      }
    }
    await Promise.all([worker(), worker()])
    try {
      const r = await api<{ event: ArchiveEvent }>(`${API}/events/${ev.id}/files`, { method: 'PUT' })
      say(failed ? `הועלו ${picked.length - failed} מתוך ${picked.length} קבצים` : `הועלו ${picked.length} קבצים לאירוע`, failed > 0)
      onDone(r.event)
    } catch (e) { setErr((e as Error).message); setBusy(false) }
  }

  const pct = prog.totalBytes ? Math.round((prog.bytes / prog.totalBytes) * 100) : 0
  const recent = events.slice(0, 4)

  return (
    <section style={{ animation: 'arcIn .35s var(--ease)' }}>
      <button className="back" onClick={onCancel} disabled={busy}><ChevronRight size={16} />{presetEvent ? 'חזרה לאירוע' : 'כל הארכיון'}</button>
      <h2 style={{ fontSize: 28, fontWeight: 900 }}>{existing ? `הוספת קבצים: ${existing.name}` : 'העלאת אירוע חדש'}</h2>
      <div className="steps">
        {['בחירת תיקייה', 'פרטי האירוע', 'העלאה'].map((t, i) => (
          <div key={t} className={`step${step === i + 1 ? ' on' : ''}${step > i + 1 ? ' done' : ''}`}><b>{step > i + 1 ? <Check size={14} /> : i + 1}</b>{t}</div>
        ))}
      </div>
      {!driveConnected && <div className="err" role="alert">Google Drive אינו מחובר, ולכן אי אפשר להעלות. יש לחבר אותו בהגדרות הגיבוי.</div>}
      <div className="up">
        <div className="panel">
          <h3>מה מעלים?</h3>
          <div className="hint">תיקייה שלמה או קבצים בודדים, מהמחשב או מהטלפון</div>
          <button type="button" className={`drop${over ? ' over' : ''}`} disabled={busy}
            onClick={() => dirInput.current?.click()}
            onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
            <FolderOpen />
            <strong>גרור לכאן תיקייה, או לחץ לבחירה</strong>
            <span>תמונות וסרטונים, בלי הגבלת כמות</span>
          </button>
          <input ref={dirInput} type="file" hidden multiple
            {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
            onChange={e => { fromFileList(e.target.files); e.target.value = '' }} />
          <input ref={fileInput} type="file" hidden multiple accept="image/*,video/*"
            onChange={e => { fromFileList(e.target.files); e.target.value = '' }} />
          <div style={{ marginTop: 8 }}>
            <button type="button" className="chip" onClick={() => fileInput.current?.click()} disabled={busy}>או בחירת קבצים בודדים</button>
          </div>
          <div className="field" style={{ marginTop: 16 }}>
            <label htmlFor="drivelink">או הדבקת קישור לתיקיית Drive</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input id="drivelink" dir="ltr" value={link} onChange={e => setLink(e.target.value)} disabled={busy || checking}
                placeholder="https://drive.google.com/drive/folders/…"
                onKeyDown={e => { if (e.key === 'Enter' && link.trim()) void checkLink() }} />
              <button type="button" className="chip" onClick={checkLink} disabled={busy || checking || !link.trim()}>{checking ? 'בודק…' : 'בדיקה'}</button>
            </div>
            <div className="hint">המערכת תשאב את כל התמונות והסרטונים בתיקייה ובתיקיות המשנה שלה, בלי להוריד ולהעלות מחדש. התיקייה צריכה להיות משותפת עם חשבון ה-Drive של המערכת, או פתוחה ל״כל מי שיש לו קישור״.</div>
          </div>
          {drive && <>
            <div className="folder on">
              <FolderOpen size={20} />
              <b>{drive.name}</b>
              <span>{drive.photos} תמונות · {drive.videos} סרטונים · {formatBytes(drive.bytes)} · מ-Drive</span>
            </div>
            <button type="button" className="chip" style={{ marginTop: 10 }} onClick={() => { setDrive(null); setLink(''); setFolderName('') }} disabled={busy}>ניקוי הבחירה</button>
          </>}
          {picked.length > 0 && <>
            <div className="folder on">
              <FolderOpen size={20} />
              <b>{folderName || 'קבצים שנבחרו'}</b>
              <span>{photos} תמונות · {videos} סרטונים · {formatBytes(totalBytes)}</span>
            </div>
            <div className="thumbs">
              {previews.slice(0, picked.length > 12 ? 11 : 12).map((u, i) => <div key={u} className="ph" style={{ ...gradient('אחר'), animationDelay: `${i * 30}ms` }}><img src={u} alt="" /></div>)}
              {picked.length > 12 && <div className="more">+{picked.length - 11}</div>}
            </div>
            <button type="button" className="chip" style={{ marginTop: 10 }} onClick={() => { setPicked([]); setFolderName('') }} disabled={busy}>ניקוי הבחירה</button>
          </>}
        </div>

        <div className="panel">
          <h3>לאיזה אירוע זה שייך?</h3>
          <div className="hint">בכל העלאה המערכת שואלת, כדי שהכול יהיה מסודר ויימצא בחיפוש</div>
          {existing ? (
            <div className="field"><label>אירוע קיים</label>
              <div className="folder on" style={{ marginTop: 0 }}><b>{existing.name}</b><span>{existing.hebrew_date}</span></div>
              <button type="button" className="chip" style={{ marginTop: 8 }} onClick={() => setExisting(null)} disabled={busy}>במקום זה — אירוע חדש</button></div>
          ) : <>
            <div className="field"><label htmlFor="evname">שם האירוע <em>*</em></label>
              <input id="evname" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="למשל: הילולת מרן החתם סופר" />
              {recent.length > 0 && <div className="typepick" style={{ marginTop: 8 }}>
                <span className="small">או הוסף לאירוע קיים:</span>
                {recent.map(ev => <button key={ev.id} type="button" className="chip" onClick={() => setExisting(ev)}>{ev.name}</button>)}
              </div>}
            </div>
            <EventFields f={f} setF={setF} heb={heb?.date ?? null} hideName />
          </>}
          {busy && (
            <div className="prog on">
              <div style={{ fontSize: 14, fontWeight: 600 }}>{drive ? 'שואב מ-Drive… אפשר להישאר במסך עד הסיום' : 'מעלה ל-Drive… נא לא לסגור את המסך עד הסיום'}</div>
              <div className="track"><i style={{ width: `${pct}%` }} /></div>
              <div className="t"><span>{prog.done} מתוך {prog.total}</span><span>{pct}%</span></div>
            </div>
          )}
          {err && <div className="err" role="alert">{err}</div>}
          <div className="actions">
            <button className="btn ghost" onClick={onCancel} disabled={busy}>ביטול</button>
            <button className="btn" onClick={save} disabled={!canSave}><ArrowRight style={{ display: 'none' }} />{busy ? 'מעלה…' : 'שמירה והעלאה'}</button>
          </div>
        </div>
      </div>
    </section>
  )
}
