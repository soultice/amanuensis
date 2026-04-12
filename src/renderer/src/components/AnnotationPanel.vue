<template>
  <div class="annotation-panel">
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
import { ref, onMounted } from 'vue'
import { useAnnotationStore } from '../stores/annotation'
import type { Annotation, AnnotationType } from '../stores/annotation'
import AnnotationDialog from './AnnotationDialog.vue'

const annotationStore = useAnnotationStore()
const editingAnnotation = ref<Annotation | null>(null)
const dragActiveId = ref<string | null>(null)
const assetsDir = ref<string>('')

onMounted(async () => {
  assetsDir.value = await window.api.getAssetsDir()
})

function assetUrl(filename: string): string {
  return assetsDir.value ? `file://${assetsDir.value}/${filename}` : ''
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
</script>

<style scoped>
.annotation-panel {
  padding: 12px 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
}
.annotation-panel__empty {
  color: #9ca3af;
  font-size: 0.8rem;
  padding: 8px 0;
}
.annotation-card {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px 12px;
  background: white;
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
  background: #1a56db;
  color: white;
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
  color: #374151;
}
.annotation-card__range {
  font-size: 0.7rem;
  color: #9ca3af;
  flex: 1;
}
.annotation-card__actions { display: flex; gap: 4px; }
.icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #6b7280;
  font-size: 0.85rem;
  padding: 2px 4px;
  border-radius: 3px;
}
.icon-btn:hover { background: #f3f4f6; color: #374151; }
.icon-btn--danger:hover { background: #fce8e6; color: #dc2626; }
.annotation-card__body { margin-bottom: 4px; }
.annotation-card__image {
  max-width: 100%;
  max-height: 80px;
  object-fit: contain;
  border-radius: 4px;
}
.annotation-card__text {
  font-size: 0.8rem;
  color: #374151;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.annotation-card__hint {
  font-size: 0.68rem;
  color: #d1d5db;
  margin-top: 4px;
}
</style>
