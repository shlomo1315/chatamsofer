// אייקוני קו של מחלקת הסיוע (מתוך המוקאפ המאושר), מעוצבים ב-.aidui svg.i
const PATHS: Record<string, React.ReactNode> = {
  check: <path d="M5 12l5 5L20 7" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>,
  send: <path d="M21 3L10 14M21 3l-7 18-4-7-7-4z" />,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></>,
  hist: <path d="M3 12a9 9 0 109-9 9 9 0 00-7 3.3M3 4v4h4M12 7v5l3 2" />,
  file: <><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" /><path d="M14 3v6h6" /></>,
  up: <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></>,
  link: <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />,
  back: <><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 010 10h-3" /></>,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" />,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2 20a7 7 0 0114 0M16 4.5a3.5 3.5 0 010 7M22 20a7 7 0 00-4-6.3" /></>,
  dl: <path d="M12 4v12M6 10l6 6 6-6M4 20h16" />,
}

export type AidIconName = keyof typeof PATHS

export default function AidIcon({ name, size, style }: { name: string; size?: number; style?: React.CSSProperties }) {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true" style={size ? { width: size, height: size, ...style } : style}>
      {PATHS[name]}
    </svg>
  )
}
