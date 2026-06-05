'use client'
import { useState, useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'

const INPUT_CLS =
  'w-full rounded-lg border px-3 py-2 text-sm text-slate-900 bg-white ' +
  'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ' +
  'placeholder:text-slate-400 border-slate-300 transition-colors'

const INPUT_ERR = '!border-red-400 focus:!ring-red-400'
const INPUT_DIS = 'disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed'

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
  const [addrInput, setAddrInput] = useState(address)
  const [showAddr, setShowAddr] = useState(false)
  const cityRef = useRef<HTMLDivElement>(null)
  const addrRef = useRef<HTMLDivElement>(null)
  const labelCls = labelSize === 'xs'
    ? 'text-xs font-medium text-slate-600'
    : 'text-sm font-medium text-slate-700'

  // Load cities once
  useEffect(() => {
    fetch('/api/gov/cities')
      .then(r => r.json())
      .then(d => setAllCities(d.cities ?? []))
      .catch(() => {})
  }, [])

  // Sync from parent (edit mode)
  useEffect(() => { setCityInput(city) }, [city])
  useEffect(() => { setAddrInput(address) }, [address])

  // Fetch streets when city confirmed
  useEffect(() => {
    if (!city) { setStreets([]); return }
    setLoadingStreets(true)
    fetch(`/api/gov/streets?city=${encodeURIComponent(city)}`)
      .then(r => r.json())
      .then(d => setStreets(d.streets ?? []))
      .catch(() => setStreets([]))
      .finally(() => setLoadingStreets(false))
  }, [city])

  // Click-outside
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!cityRef.current?.contains(e.target as Node)) setShowCity(false)
      if (!addrRef.current?.contains(e.target as Node)) setShowAddr(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const filteredCities = cityInput.trim()
    ? allCities.filter(c => c.includes(cityInput.trim())).slice(0, 20)
    : allCities.slice(0, 15)

  // Strip trailing digits to get the street-name portion for filtering
  const streetQuery = addrInput.replace(/\s*\d.*$/, '').trim()
  const filteredStreets = streetQuery
    ? streets.filter(s => s.includes(streetQuery)).slice(0, 15)
    : streets.slice(0, 12)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* ── City ── */}
      <div className="flex flex-col gap-1">
        <label className={labelCls}>
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
              // Only confirm a city once the user picks from the list
              if (!allCities.includes(v)) onCityChange('')
              else onCityChange(v)
            }}
            onFocus={() => setShowCity(true)}
            placeholder="חפש עיר..."
            autoComplete="off"
            required={cityRequired}
            className={`${INPUT_CLS} ${cityError ? INPUT_ERR : ''}`}
          />
          {showCity && filteredCities.length > 0 && (
            <ul className="absolute z-50 top-full mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
              {filteredCities.map(c => (
                <li key={c}>
                  <button
                    type="button"
                    className="w-full text-right px-3 py-2 text-sm text-slate-900 hover:bg-indigo-50 transition-colors"
                    onMouseDown={e => {
                      e.preventDefault()
                      setCityInput(c)
                      onCityChange(c)
                      setShowCity(false)
                      setAddrInput('')
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

      {/* ── Address ── */}
      <div className="flex flex-col gap-1">
        <label className={labelCls}>
          רחוב ומספר{addressRequired && <span className="text-red-500 mr-1">*</span>}
        </label>
        <div ref={addrRef} className="relative">
          <input
            type="text"
            value={addrInput}
            onChange={e => {
              const v = e.target.value
              setAddrInput(v)
              onAddressChange(v)
              if (city && streets.length > 0) setShowAddr(true)
            }}
            onFocus={() => { if (city && streets.length > 0) setShowAddr(true) }}
            placeholder={city ? 'רחוב ומספר בית' : 'בחר עיר תחילה'}
            disabled={!city}
            autoComplete="off"
            required={addressRequired}
            className={`${INPUT_CLS} ${INPUT_DIS} ${addressError ? INPUT_ERR : ''}`}
          />
          {loadingStreets && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <Loader2 size={14} className="animate-spin text-slate-400" />
            </span>
          )}
          {showAddr && !loadingStreets && filteredStreets.length > 0 && (
            <ul className="absolute z-50 top-full mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
              {filteredStreets.map(s => (
                <li key={s}>
                  <button
                    type="button"
                    className="w-full text-right px-3 py-2 text-sm text-slate-900 hover:bg-indigo-50 transition-colors"
                    onMouseDown={e => {
                      e.preventDefault()
                      // Preserve any number the user may have already typed
                      const numMatch = addrInput.match(/\d[\d\s/א-ת]*$/)
                      const newVal = numMatch ? `${s} ${numMatch[0].trim()}` : `${s} `
                      setAddrInput(newVal)
                      onAddressChange(newVal)
                      setShowAddr(false)
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
    </div>
  )
}
