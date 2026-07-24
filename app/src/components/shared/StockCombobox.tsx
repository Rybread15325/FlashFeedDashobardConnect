'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'

const fetcher = (u: string) => fetch(u).then(r => r.json())

// Matches the app's screener payload shapes (tickers | rows | data | array).
function rowsFrom(payload: any): any[] {
  const candidates = [payload?.tickers, payload?.rows, payload?.data, Array.isArray(payload) ? payload : null]
  return candidates.find(c => Array.isArray(c) && c.length) ?? candidates.find(c => Array.isArray(c)) ?? []
}

// Every stock in the screener universe, deduped + alphabetized. Cached app-wide
// so each combobox instance reuses one fetch.
export function useAllStocks(): { ticker: string; company: string }[] {
  const { data } = useSWR('/api/screener?limit=6000&compact=1', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 300_000,
    keepPreviousData: true,
  })
  return useMemo(() => {
    const map = new Map<string, string>()
    for (const r of rowsFrom(data)) {
      const t = String(r?.ticker ?? r?.symbol ?? '').toUpperCase().trim()
      if (t && !map.has(t)) map.set(t, String(r?.company ?? r?.name ?? ''))
    }
    return Array.from(map, ([ticker, company]) => ({ ticker, company })).sort((a, b) => a.ticker.localeCompare(b.ticker))
  }, [data])
}

/**
 * Type-to-search dropdown over every stock. Typing filters by ticker OR company
 * name and shows all matches; click or Enter picks one.
 *
 *  - onSelect  fires when a suggestion is chosen (or Enter on free text)
 *  - onChange  fires on every keystroke (for inputs that filter live)
 */
export function StockCombobox({
  value,
  onSelect,
  onChange,
  placeholder = 'Type a stock…',
  className,
  maxResults = 60,
}: {
  value: string
  onSelect: (ticker: string) => void
  onChange?: (v: string) => void
  placeholder?: string
  className?: string
  maxResults?: number
}) {
  const stocks = useAllStocks()
  const [query, setQuery] = useState(value || '')
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setQuery(value || '') }, [value])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const q = query.trim().toUpperCase()
  const matches = useMemo(() => {
    if (!q) return stocks.slice(0, maxResults)
    const starts: typeof stocks = []
    const contains: typeof stocks = []
    for (const s of stocks) {
      if (s.ticker.startsWith(q)) starts.push(s)
      else if (s.ticker.includes(q) || s.company.toUpperCase().includes(q)) contains.push(s)
    }
    return [...starts, ...contains].slice(0, maxResults)
  }, [q, stocks, maxResults])

  function choose(t: string) {
    const up = t.toUpperCase()
    setQuery(up)
    onChange?.(up)
    onSelect(up)
    setOpen(false)
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi(h => Math.min(matches.length - 1, h + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(0, h - 1)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (open && matches[hi]) choose(matches[hi].ticker)
      else if (q) choose(q)
    } else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        value={query}
        onChange={e => {
          const v = e.target.value.toUpperCase()
          setQuery(v); onChange?.(v); setOpen(true); setHi(0)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        className={className}
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-72 w-[260px] overflow-y-auto rounded-lg border border-border bg-[#0d1b2e] text-sm shadow-2xl">
          {matches.map((s, i) => (
            <li
              key={s.ticker}
              onMouseEnter={() => setHi(i)}
              onMouseDown={e => { e.preventDefault(); choose(s.ticker) }}
              className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 ${i === hi ? 'bg-accent/20' : 'hover:bg-bg/60'}`}
            >
              <span className="w-16 shrink-0 font-mono font-semibold text-accent">{s.ticker}</span>
              <span className="truncate text-xs text-slate-300">{s.company || '—'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
