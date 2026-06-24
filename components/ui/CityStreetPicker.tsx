'use client'
import { useState, useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'

const BASE =
  'w-full rounded-lg border px-3 py-2 text-sm text-slate-900 bg-white ' +
  'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ' +
  'placeholder:text-slate-400 border-slate-300 transition-colors'

const ERR = '!border-red-400 focus:!ring-red-400'
const DIS = 'disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed'

// Split "רחוב הרצל 12" → { street: "רחוב הרצל", houseNumber: "12" }
function splitAddr(addr: string): { street: string; houseNumber: string } {
  const m = addr.trim().match(/^(.*?)\s*(\d[\d/א-ת\s]*)$/)
  return m ? { street: m[1].trim(), houseNumber: m[2].trim() } : { street: addr.trim(), houseNumber: '' }
}

interface Props {
  city: string
  address: string
  onCityChange: (city: string) => void
  onAddressChange: (address: string) => void
  cityError?: string
  addressError?: string
  cityRequired?: boolean
  addressRequired?: boolean
  labelSize?: 'xs' | 'sm'
}

export default function CityStreetPicker({
  city, address,
  onCityChange, onAddressChange,
  cityError, addressError,
  cityRequired, addressRequired,
  labelSize = 'sm',
}: Props) {
  const [allCities, setAllCities] = useState<string[]>([])
  const [cityInput, setCityInput] = useState(city)
  const [showCity, setShowCity] = useState(false)

  const [streets, setStreets] = useState<string[]>([])
  const [loadingStreets, setLoadingStreets] = useState(false)
  const { street: initStreet, houseNumber: initNum } = splitAddr(address)
  const [streetInput, setStreetInput] = useState(initStreet)
  const [houseNum, setHouseNum] = useState(initNum)
  const [showStreet, setShowStreet] = useState(false)

  const cityRef = useRef<HTMLDivElement>(null)
  const streetRef = useRef<HTMLDivElement>(null)
  const lbl = labelSize === 'xs' ? 'text-xs font-medium text-slate-600' : 'text-sm font-medium text-slate-700'

  useEffect(() => {
    // _=timestamp — כתובת ייחודית שעוקפת כל מטמון (דפדפן ו-CDN/Cloudflare)
    fetch(`/api/gov/cities?_=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setAllCities(d.cities ?? []))
      .catch(() => {})
  }, [])

  // Sync parent → internal when editing existing record
  useEffect(() => { setCityInput(city) }, [city])
  useEffect(() => {
    const { street, houseNumber } = splitAddr(address)
    setStreetInput(street)
    setHouseNum(houseNumber)
  }, [address])

  // Fetch streets when city is confirmed
  useEffect(() => {
    if (!city) { setStreets([]); return }
    setLoadingStreets(true)
    fetch(`/api/gov/streets?city=${encodeURIComponent(city)}&_=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setStreets(d.streets ?? []))
      .catch(() => setStreets([]))
      .finally(() => setLoadingStreets(false))
  }, [city])

  // Click-outside
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!cityRef.current?.contains(e.target as Node)) setShowCity(false)
      if (!streetRef.current?.contains(e.target as Node)) setShowStreet(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  function emitAddress(street: string, num: string) {
    const combined = num.trim() ? `${street.trim()} ${num.trim()}` : street.trim()
    onAddressChange(combined)
  }

  // מציגים תוצאות *רק* כשמקלידים — סינון על הרשימה המלאה והעדכנית לפי מה שהוקלד.
  // בלי הקלדה אין רשימה (אין תקיעה, ומופיע בדיוק מה שמחפשים).
  const filteredCities = cityInput.trim() ? allCities.filter(c => c.includes(cityInput.trim())) : []
  const filteredStreets = streetInput.trim() ? streets.filter(s => s.includes(streetInput.trim())) : []

  return (
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">

      {/* ── City ── */}
      <div className="flex flex-col gap-1 sm:col-span-1">
        <label className={lbl}>
          עיר{cityRequired && <span className="text-red-500 mr-1">*</span>}
        </label>
        <div ref={cityRef} className="relative">
          <input
            type="text"
            value={cityInput}
            onChange={e => {
              const v = e.target.value
              setCityInput(v)
              setShowCity(true)
              if (!allCities.includes(v)) onCityChange('')
              else onCityChange(v)
            }}
            onFocus={() => setShowCity(true)}
            placeholder="חפש עיר..."
            autoComplete="off"
            required={cityRequired}
            className={`${BASE} ${cityError ? ERR : ''}`}
          />
          {showCity && filteredCities.length > 0 && (
            <ul className="absolute z-50 top-full mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
              {filteredCities.map(c => (
                <li key={c} className="[content-visibility:auto] [contain-intrinsic-size:auto_38px]">
                  <button
                    type="button"
                    className="w-full text-right px-3 py-2 text-sm text-slate-900 hover:bg-indigo-50 transition-colors"
                    onMouseDown={e => {
                      e.preventDefault()
                      setCityInput(c)
                      onCityChange(c)
                      setShowCity(false)
                      setStreetInput('')
                      setHouseNum('')
                      onAddressChange('')
                    }}
                  >
                    {c}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {cityError && <p className="text-xs text-red-500">{cityError}</p>}
      </div>

      {/* ── Street ── */}
      <div className="flex flex-col gap-1 sm:col-span-2">
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
            placeholder={city ? 'שם הרחוב' : 'בחר עיר תחילה'}
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
                <li key={s} className="[content-visibility:auto] [contain-intrinsic-size:auto_38px]">
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
        </div>
        {addressError && <p className="text-xs text-red-500">{addressError}</p>}
      </div>

      {/* ── House Number ── */}
      <div className="flex flex-col gap-1 sm:col-span-1">
        <label className={lbl}>מספר בית</label>
        <input
          type="text"
          value={houseNum}
          onChange={e => {
            const v = e.target.value
            setHouseNum(v)
            emitAddress(streetInput, v)
          }}
          placeholder="12"
          disabled={!city}
          className={`${BASE} ${DIS}`}
        />
      </div>

    </div>
  )
}
