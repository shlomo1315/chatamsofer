// הצהרת טיפוסים מינימלית ל-bidi-js (אין @types רשמי).
declare module 'bidi-js' {
  interface BidiApi {
    getEmbeddingLevels(text: string, baseDirection?: 'ltr' | 'rtl' | 'auto'): {
      levels: Uint8Array
      paragraphs: { start: number; end: number; level: number }[]
    }
    getReorderedString(text: string, embeddingLevels: ReturnType<BidiApi['getEmbeddingLevels']>): string
    getReorderedIndices(text: string, embeddingLevels: ReturnType<BidiApi['getEmbeddingLevels']>): number[]
    getReorderSegments(text: string, embeddingLevels: ReturnType<BidiApi['getEmbeddingLevels']>): [number, number][]
    getMirroredCharacter(char: string): string | null
  }
  export default function bidiFactory(): BidiApi
}
