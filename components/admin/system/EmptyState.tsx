// מצב ריק אחיד לכל טבלה ורשימה במערכת הניהול.
export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-sand p-10 text-center text-sm text-ink-soft">
      {children}
    </div>
  )
}
