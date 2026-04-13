<template>
  <div class="annotation-panel">
    <!-- Panel header with export button (D-01, D-03) -->
    <div class="annotation-panel__header">
      <span class="annotation-panel__title">Annotations</span>
      <button
        class="export-btn"
        :disabled="!transcriptStore.hasTranscript"
        :title="transcriptStore.hasTranscript ? 'Export transcript as Markdown' : 'Transcribe first to enable export'"
        @click="exportMarkdown"
      >
        ↓ Export .md
      </button>
    </div>

    <div v-if="annotationStore.sortedAnnotations.length === 0" class="annotation-panel__empty">
      <p>Select words and click <strong>+ Annotate</strong> to add annotations.</p>
    </div>

    <div
      v-for="(annotation, index) in annotationStore.sortedAnnotations"
      :key="annotation.id"
      class="annotation-card"
      draggable="true"
      @dragstart="onDragStart($event, annotation.id)"
      @dragend="dragActiveId = null"
    >
      <!-- Header: badge, type, word range, edit/remove -->
      <div class="annotation-card__header">
        <span class="annotation-card__badge">{{ index + 1 }}</span>
        <span class="annotation-card__type">{{ typeLabel(annotation.type) }}</span>
        <span class="annotation-card__range">
          words {{ annotation.wordStartIdx + 1 }}–{{ annotation.wordEndIdx + 1 }}
        </span>
        <div class="annotation-card__actions">
          <button class="icon-btn" title="Edit" @click="openEdit(annotation)">✎</button>
          <button
            class="icon-btn icon-btn--danger"
            title="Remove"
            @click="annotationStore.removeAnnotation(annotation.id)"
          >✕</button>
        </div>
      </div>

      <!-- Content preview -->
      <div class="annotation-card__body">
        <img
          v-if="annotation.type === 'image' && annotation.assetFilename"
          :src="assetUrl(annotation.assetFilename)"
          class="annotation-card__image"
          alt="annotation image"
        />
        <p v-else-if="annotation.type === 'audio'" class="annotation-card__text">
          🎵 {{ annotation.assetFilename }}
        </p>
        <p v-else-if="annotation.type === 'link'" class="annotation-card__text">
          <a :href="annotation.content" target="_blank" rel="noopener">{{ annotation.content }}</a>
        </p>
        <p v-else class="annotation-card__text">{{ annotation.content }}</p>
      </div>

      <p class="annotation-card__hint">Drag to move to a different word</p>
    </div>

    <!-- Edit dialog (ANNOT-05) -->
    <AnnotationDialog
      v-if="editingAnnotation"
      :word-start-idx="editingAnnotation.wordStartIdx"
      :word-end-idx="editingAnnotation.wordEndIdx"
      :editing-annotation="editingAnnotation"
      @close="editingAnnotation = null"
      @saved="editingAnnotation = null"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAnnotationStore } from '../stores/annotation'
import { useTranscriptStore } from '../stores/transcript'
import { useSessionStore } from '../stores/session'
import type { Annotation, AnnotationType } from '../stores/annotation'
import AnnotationDialog from './AnnotationDialog.vue'

const annotationStore = useAnnotationStore()
const transcriptStore = useTranscriptStore()
const sessionStore = useSessionStore()
const editingAnnotation = ref<Annotation | null>(null)
const dragActiveId = ref<string | null>(null)

function assetUrl(filename: string): string {
  return `asset://localhost/${filename}`
}

function typeLabel(type: AnnotationType): string {
  return { image: 'Image', audio: 'Audio', text: 'Text', link: 'Link' }[type]
}

function openEdit(annotation: Annotation): void {
  editingAnnotation.value = annotation
}

function onDragStart(event: DragEvent, annotationId: string): void {
  event.dataTransfer!.effectAllowed = 'move'
  event.dataTransfer!.setData('text/plain', annotationId)
  dragActiveId.value = annotationId
}

async function exportMarkdown(): Promise<void> {
  if (!transcriptStore.hasTranscript) return

  const words = transcriptStore.words
  const segments = transcriptStore.segments
  const annotations = annotationStore.sortedAnnotations
  const assetsDir = await window.api.getAssetsDir(sessionStore.currentSessionId!)

  const wordMarker = new Map<number, string>()
  const assetsToCopy: Array<{ src: string; dest: string }> = []
  const footnotes: string[] = []
  let fnNum = 0

  for (const ann of annotations) {
    let marker = ''
    if (ann.type === 'image' && ann.assetFilename) {
      marker = `![](assets/${ann.assetFilename})`
      assetsToCopy.push({ src: `${assetsDir}/${ann.assetFilename}`, dest: ann.assetFilename })
    } else if (ann.type === 'link') {
      marker = `[${ann.content}](${ann.content})`
    } else {
      fnNum++
      if (ann.type === 'audio' && ann.assetFilename) {
        footnotes.push(`[^${fnNum}]: \uD83C\uDFB5 ${ann.assetFilename}`)
        assetsToCopy.push({ src: `${assetsDir}/${ann.assetFilename}`, dest: ann.assetFilename })
      } else {
        footnotes.push(`[^${fnNum}]: ${ann.content}`)
      }
      marker = `[^${fnNum}]`
    }
    wordMarker.set(ann.wordEndIdx, marker)
  }

  const lines: string[] = ['# Transcript', '']
  for (const segment of segments) {
    const segWords = words.filter(w => w.segmentId === segment.id)
    let buffer = ''
    for (const w of segWords) {
      const marker = wordMarker.get(w.id) ?? ''
      if (marker.startsWith('![')) {
        // image → flush text buffer as its own line, then image on its own line
        const flushed = (buffer + w.word).trim()
        if (flushed) lines.push(flushed)
        lines.push(marker)
        buffer = ''
      } else {
        buffer += w.word + marker
      }
    }
    const remaining = buffer.trim()
    if (remaining) lines.push(remaining)
  }

  if (footnotes.length > 0) {
    lines.push('', '---', '')
    footnotes.forEach(f => lines.push(f))
  }

  const markdown = lines.join('\n')
  const result = await window.api.exportMarkdown({ markdown, assetsToCopy })
  if (!result.canceled) {
    console.log('[export] Written to:', result.filePath)
  }
}
</script>

<style scoped>
.annotation-panel {
  padding: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg);
}
.annotation-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  background: var(--bg-hl);
}
.annotation-panel__title {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-em);
}
.export-btn {
  padding: 4px 12px;
  background: var(--accent);
  color: #fdf6e3;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 500;
}
.export-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.export-btn:hover:not(:disabled) { background: var(--accent-2); }
.annotation-panel__empty {
  color: var(--text-de);
  font-size: 0.8rem;
  padding: 12px 16px;
}
.annotation-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--bg-raised);
  cursor: grab;
  user-select: none;
  flex-shrink: 0;
}
.annotation-card:active { cursor: grabbing; }
.annotation-card__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.annotation-card__badge {
  background: var(--accent);
  color: #fdf6e3;
  font-size: 0.65rem;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.annotation-card__type {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-em);
}
.annotation-card__range {
  font-size: 0.7rem;
  color: var(--text-de);
  flex: 1;
}
.annotation-card__actions { display: flex; gap: 4px; }
.icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-de);
  font-size: 0.85rem;
  padding: 2px 4px;
  border-radius: 3px;
}
.icon-btn:hover { background: var(--bg-hl); color: var(--text-em); }
.icon-btn--danger:hover { background: rgba(220,50,47,0.1); color: var(--danger); }
.annotation-card__body { margin-bottom: 4px; }
.annotation-card__image {
  max-width: 100%;
  max-height: 80px;
  object-fit: contain;
  border-radius: 4px;
}
.annotation-card__text {
  font-size: 0.8rem;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.annotation-card__hint {
  font-size: 0.68rem;
  color: var(--border);
  margin-top: 4px;
}
</style>
