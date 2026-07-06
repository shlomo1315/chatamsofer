'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { X, Eraser, Check } from 'lucide-react'

// חלונית חתימה — המשתמש חותם באצבע/עכבר, והחתימה נשמרת כתמונה (PNG data URL).
// onConfirm מקבל את ה-data URL; onCancel נסגר ללא שמירה.
export default function SignaturePad({
  open, onConfirm, onCancel,
}: {
  open: boolean
  onConfirm: (dataUrl: string) => void
  onCancel: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [hasInk, setHasInk] = useState(false)

  // התאמת רזולוציית הקנבס לרוחב בפועל (חד גם במסכי retina)
  const setup = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.scale(dpr, dpr)
      ctx.lineWidth = 2.2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = '#0f172a'
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setHasInk(false)
    // המתנה קצרה שה-DOM יתייצב לפני מדידת הרוחב
    const t = setTimeout(setup, 30)
    const onResize = () => setup()
    window.addEventListener('resize', onResize)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => { clearTimeout(t); window.removeEventListener('resize', onResize); window.removeEventListener('keydown', onKey) }
  }, [open, setup, onCancel])

  const pos = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  const start = (e: React.PointerEvent) => {
    e.preventDefault()
    drawing.current = true
    last.current = pos(e)
    canvasRef.current?.setPointerCapture(e.pointerId)
  }
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !last.current) return
    const p = pos(e)
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
    if (!hasInk) setHasInk(true)
  }
  const end = () => { drawing.current = false; last.current = null }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
  }

  const confirm = () => {
    const canvas = canvasRef.current
    if (!canvas || !hasInk) return
    onConfirm(canvas.toDataURL('image/png'))
  }

  if (!open) return null

  return (
    <div onClick={onCancel} className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-4">
      <div onClick={e => e.stopPropagation()} className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden" dir="rtl">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <h3 className="font-bold text-slate-900">חתימה דיגיטלית</h3>
          <button onClick={onCancel} title="סגירה" className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>
        <div className="p-5">
          <p className="text-sm text-slate-500 mb-3">חתמו בתוך המסגרת באמצעות העכבר או האצבע.</p>
          <canvas
            ref={canvasRef}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
            className="w-full h-44 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 touch-none cursor-crosshair"
          />
          <div className="flex items-center justify-between gap-2 mt-4">
            <button type="button" onClick={clear}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-800 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50">
              <Eraser size={15} /> ניקוי
            </button>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onCancel}
                className="text-sm font-medium text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg">ביטול</button>
              <button type="button" onClick={confirm} disabled={!hasInk}
                className="inline-flex items-center gap-1.5 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white px-5 py-2 rounded-lg transition-colors">
                <Check size={16} /> אישור החתימה
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
