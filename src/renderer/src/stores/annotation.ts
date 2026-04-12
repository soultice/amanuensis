import { defineStore } from 'pinia'

export type AnnotationType = 'image' | 'audio' | 'text' | 'link'

export interface Annotation {
  id: string              // UUID from crypto.randomUUID()
  wordStartIdx: number    // inclusive — index into transcriptStore.words[]
  wordEndIdx: number      // inclusive
  type: AnnotationType
  content: string         // text/URL for text+link; empty for image/audio
  assetFilename: string | null  // filename in userData/sessions/assets/ for image/audio
  createdAt: string       // ISO timestamp
}

export const useAnnotationStore = defineStore('annotation', {
  state: () => ({
    annotations: [] as Annotation[],
  }),

  getters: {
    // Sorted by wordStartIdx for display order and badge numbering
    sortedAnnotations(): Annotation[] {
      return [...this.annotations].sort((a, b) => a.wordStartIdx - b.wordStartIdx)
    },

    // Check if [startIdx, endIdx] overlaps any existing annotation
    // excludeId: skip this annotation (for move/edit)
    overlapsExisting(): (startIdx: number, endIdx: number, excludeId?: string) => boolean {
      return (startIdx: number, endIdx: number, excludeId?: string): boolean =>
        this.annotations.some((a) => {
          if (a.id === excludeId) return false
          // Overlap: A.start <= B.end AND A.end >= B.start
          return startIdx <= a.wordEndIdx && endIdx >= a.wordStartIdx
        })
    },

    // Get 1-indexed badge number for the word that ends an annotation range
    badgeAtWord(): (wordIdx: number) => number | null {
      return (wordIdx: number): number | null => {
        const sorted = [...this.annotations].sort((a, b) => a.wordStartIdx - b.wordStartIdx)
        const idx = sorted.findIndex((a) => a.wordEndIdx === wordIdx)
        return idx >= 0 ? idx + 1 : null
      }
    },

    // Get annotation covering a specific word index
    annotationCoveringWord(): (wordIdx: number) => Annotation | undefined {
      return (wordIdx: number): Annotation | undefined =>
        this.annotations.find((a) => wordIdx >= a.wordStartIdx && wordIdx <= a.wordEndIdx)
    },
  },

  actions: {
    addAnnotation(annotation: Annotation): void {
      this.annotations.push(annotation)
    },

    updateAnnotation(id: string, updates: Partial<Omit<Annotation, 'id' | 'createdAt'>>): void {
      const idx = this.annotations.findIndex((a) => a.id === id)
      if (idx >= 0) Object.assign(this.annotations[idx], updates)
    },

    removeAnnotation(id: string): void {
      this.annotations = this.annotations.filter((a) => a.id !== id)
    },

    // Move annotation to a new single-word anchor (D-06, D-07)
    moveAnnotation(id: string, newWordIdx: number): void {
      this.updateAnnotation(id, { wordStartIdx: newWordIdx, wordEndIdx: newWordIdx })
    },

    clearAll(): void {
      this.annotations = []
    },
  },
})
