// טקסט בקשת תיקון אילן מהאזור האישי: שורה לכל דור שסומן "לתקן"
export interface LineageFixRow { generation: number; name?: string }
export interface LineageFixAnswer { name: string; note: string; rel: string }

export function buildLineageFixText(rows: LineageFixRow[], answers: Record<number, LineageFixAnswer>): string {
  return rows.map(r => {
    const a = answers[r.generation]
    const rel = a.rel.trim() ? ` (${a.rel.trim()})` : ''
    const note = a.note.trim() ? ` (${a.note.trim()})` : ''
    return `דור ${r.generation}: ${r.name ? `במקום "${r.name}" ` : ''}השם הנכון "${a.name.trim()}"${rel}${note}`
  }).join('\n')
}
