'use client'
import { useState, useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// בחירת רחוב מתוך המאגר הרשמי (gov_streets), לעיר *קבועה מראש* שנבחרה
// כבר במקום אחר (רשימה סגורה, כמו ערי המשלוח של יריד הספרים).
//
// ⚠️ גרסה מצומצמת של components/ui/CityStreetPicker.tsx: שם העיר עצמו
// נבחר משם בטופס (select מתוך רשימה סגורה), ולא מוקלד חופשי מכל הארץ.
// אותה לוגיקת אימות בדיוק — רחוב "נתפס" רק אם הוא קיים ברשימת הרחובות
// של העיר, כדי לא לתת כתובת מומצאת לשליח.
// ─────────────────────────────────────────────────────────────────────────────

const BASE =
  'w-full rounded-lg border px-3 py-2 text-sm text-slate-900 bg-white ' +
  'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ' +
  'placeholder:text-slate-400 border-slate-300 transition-colors'

const ERR = '!border-red-400 focus:!ring-red-400'
const DIS = 'disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed'

const _streetsCache = new Map<string, string[]>()

/** ספרות בלבד, עד 4 — למספר בית ולמספר דירה. */
function digitsOnly(v: string): string {
  return v.replace(/\D/g, '').slice(0, 4)
}

// Split "רחוב הרצל 12/3" → { street: "רחוב הרצל", houseNumber: "12", apartment: "3" }
function splitAddr(addr: string): { street: string; houseNumber: string; apartment: string } {
  const m = addr.trim().match(/^(.*?)\s*(\d[\d\-א-ת\s]*)(?:\/([^/]+))?$/)
  if (!m) return { street: addr.trim(), houseNumber: '', apartment: '' }
  return { street: m[1].trim(), houseNumber: m[2].trim(), apartment: (m[3] ?? '').trim() }
}

interface Props {
  /** שם העיר, כפי שכבר נבחרה במקום אחר בטופס. ריק = עדיין לא נבחרה עיר. */
  city: string
  address: string
  onAddressChange: (address: string) => void
  addressError?: string
  addressRequired?: boolean
  houseRequired?: boolean
  labelSize?: 'xs' | 'sm'
}

export default function StreetPicker({
  city, address, onAddressChange,
  addressError, addressRequired, houseRequired,
  labelSize = 'sm',
}: Props) {
  const [streets, setStreets] = useState<string[]>([])
  const [loadingStreets, setLoadingStreets] = useState(false)
  const { street: initStreet, houseNumber: initNum, apartment: initApt } = splitAddr(address)
  const [streetInput, setStreetInput] = useState(initStreet)
  const [houseNum, setHouseNum] = useState(initNum)
  const [apartment, setApartment] = useState(initApt)
  const [showStreet, setShowStreet] = useState(false)

  const streetRef = useRef<HTMLDivElement>(null)
  const lbl = labelSize === 'xs' ? 'text-xs font-medium text-slate-600' : 'text-sm font-medium text-slate-700'

  // עיר חדשה → מנקים את הרחוב הקודם, אחרת עלול להישאר רחוב מעיר אחרת.
  const prevCity = useRef(city)
  useEffect(() => {
    if (prevCity.current !== city) {
      prevCity.current = city
      setStreetInput(''); setHouseNum(''); setApartment('')
      onAddressChange('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city])

  useEffect(() => {
    if (!city) { setStreets([]); return }
    const cached = _streetsCache.get(city)
    if (cached) { setStreets(cached); setLoadingStreets(false); return }
    setLoadingStreets(true)
    fetch(`/api/gov/streets?city=${encodeURIComponent(city)}`)
      .then(r => r.json())
      .then(d => { const s = d.streets ?? []; _streetsCache.set(city, s); setStreets(s) })
      .catch(() => setStreets([]))
      .finally(() => setLoadingStreets(false))
  }, [city])

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!streetRef.current?.contains(e.target as Node)) setShowStreet(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

  function emitAddress(street: string, num: string, apt: string = apartment) {
    const isValid = streets.some(s => norm(s) === norm(street))
    if (!isValid) { onAddressChange(''); return }
    const houseWithApt = num.trim() ? (apt.trim() ? `${num.trim()}/${apt.trim()}` : num.trim()) : ''
    const combined = houseWithApt ? `${street.trim()} ${houseWithApt}` : street.trim()
    onAddressChange(combined)
  }

  const filteredStreets = streetInput.trim() ? streets.filter(s => s.includes(streetInput.trim())) : []
  const streetUnmatched =
    !!city && !loadingStreets && streets.length > 0 &&
    streetInput.trim() !== '' && !streets.some(s => norm(s) === norm(streetInput))

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {/* ── Street ── */}
      <div className="flex flex-col gap-1 sm:col-span-1">
        <label className={lbl}>
          רחוב{addressRequired && <span className="text-red-500 mr-1">*</span>}
        </label>
        <div ref={streetRef} className="relative">
          <input
            type="text"
            value={streetInput}
            onChange={e => {
              const v = e.target.value
              setStreetInput(v)
              emitAddress(v, houseNum)
              if (city) setShowStreet(true)
            }}
            onFocus={() => { if (city) setShowStreet(true) }}
            placeholder={city ? 'שם הרחוב' : 'בחרו עיר תחילה'}
            disabled={!city}
            autoComplete="off"
            required={addressRequired}
            className={`${BASE} ${DIS} ${addressError ? ERR : ''}`}
          />
          {loadingStreets && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <Loader2 size={14} className="animate-spin text-slate-400" />
            </span>
          )}
          {showStreet && !loadingStreets && filteredStreets.length > 0 && (
            <ul className="absolute z-50 top-full mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
              {filteredStreets.map(s => (
                <li key={s}>
                  <button
                    type="button"
                    className="w-full text-right px-3 py-2 text-sm text-slate-900 hover:bg-indigo-50 transition-colors"
                    onMouseDown={e => {
                      e.preventDefault()
                      setStreetInput(s)
                      emitAddress(s, houseNum)
                      setShowStreet(false)
                    }}
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {showStreet && !loadingStreets && streetInput.trim() !== '' && filteredStreets.length === 0 && streets.length > 0 && (
            <div className="absolute z-50 top-full mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-sm text-slate-400">
              לא נמצא רחוב כזה בעיר
            </div>
          )}
        </div>
        {addressError && <p className="text-xs text-red-500">{addressError}</p>}
        {!addressError && streetUnmatched && (
          <p className="text-xs text-amber-600">יש לבחור רחוב מתוך הרשימה של העיר</p>
        )}
      </div>

      {/* ── House Number ── */}
      <div className="flex flex-col gap-1 sm:col-span-1">
        <label className={lbl}>מספר בית{houseRequired && <span className="text-red-500 mr-1">*</span>}</label>
        <input
          type="text"
          value={houseNum}
          // ⚠️ הסינון בהקלדה ולא ב-maxLength/type=number: maxLength אינו
          // חוסם הדבקה, ו-type=number מאפשר 'e', '+' ומקף.
          onChange={e => {
            const v = digitsOnly(e.target.value)
            setHouseNum(v)
            emitAddress(streetInput, v, apartment)
          }}
          placeholder="12"
          inputMode="numeric"
          disabled={!city}
          required={houseRequired}
          className={`${BASE} ${DIS}`}
        />
      </div>

      {/* ── Apartment Number ── */}
      <div className="flex flex-col gap-1 sm:col-span-1">
        <label className={lbl}>מספר דירה</label>
        <input
          type="text"
          value={apartment}
          onChange={e => {
            const v = digitsOnly(e.target.value)
            setApartment(v)
            emitAddress(streetInput, houseNum, v)
          }}
          placeholder="3"
          inputMode="numeric"
          disabled={!city}
          className={`${BASE} ${DIS}`}
        />
      </div>
    </div>
  )
}
