<template>
  <dialog
    ref="dialogRef"
    class="annotation-dialog"
    @close="emit('close')"
  >
    <div class="annotation-dialog__content">
      <h3 class="annotation-dialog__title">
        {{ props.editingAnnotation ? 'Edit annotation' : 'Add annotation' }}
      </h3>

      <!-- Type selector -->
      <div class="annotation-dialog__types">
        <button
          v-for="t in types"
          :key="t.value"
          class="type-btn"
          :class="{ 'type-btn--active': selectedType === t.value }"
          @click="selectedType = t.value"
        >{{ t.label }}</button>
      </div>

      <!-- Image (ANNOT-01, ANNOT-02) -->
      <div v-if="selectedType === 'image'" class="annotation-dialog__body">
        <img v-if="previewUrl" :src="previewUrl" class="annotation-dialog__preview" alt="Preview" />
        <div class="annotation-dialog__actions-row">
          <button class="btn-secondary" @click="pickImage">Pick file…</button>
          <button class="btn-secondary" @click="pasteImage">Paste clipboard</button>
        </div>
      </div>

      <!-- Audio (ANNOT-04) -->
      <div v-else-if="selectedType === 'audio'" class="annotation-dialog__body">
        <p v-if="assetFilename" class="annotation-dialog__filename">🎵 {{ assetFilename }}</p>
        <button class="btn-secondary" @click="pickAudio">Pick audio file…</button>
      </div>

      <!-- Text (ANNOT-03 text) -->
      <div v-else-if="selectedType === 'text'" class="annotation-dialog__body">
        <textarea
          v-model="textContent"
          class="annotation-dialog__textarea"
          placeholder="Enter text…"
          rows="4"
        />
        <button class="btn-secondary" @click="pasteText">Paste clipboard</button>
      </div>

      <!-- Link (ANNOT-03 link) -->
      <div v-else-if="selectedType === 'link'" class="annotation-dialog__body">
        <input
          v-model="textContent"
          class="annotation-dialog__input"
          type="url"
          placeholder="https://…"
        />
        <button class="btn-secondary" @click="pasteText">Paste clipboard</button>
      </div>

      <!-- Footer -->
      <div class="annotation-dialog__footer">
        <button class="btn-secondary" @click="dialogRef?.close()">Cancel</button>
        <button class="btn-primary" :disabled="!canSave" @click="save">
          {{ props.editingAnnotation ? 'Update' : 'Add' }}
        </button>
      </div>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAnnotationStore } from '../stores/annotation'
import type { Annotation, AnnotationType } from '../stores/annotation'

const props = defineProps<{
  wordStartIdx: number
  wordEndIdx: number
  editingAnnotation?: Annotation | null
}>()
const emit = defineEmits<{ close: []; saved: [annotation: Annotation] }>()

const annotationStore = useAnnotationStore()
const dialogRef = ref<HTMLDialogElement>()

const types: Array<{ value: AnnotationType; label: string }> = [
  { value: 'image', label: 'Image' },
  { value: 'audio', label: 'Audio' },
  { value: 'text', label: 'Text' },
  { value: 'link', label: 'Link' },
]

const selectedType = ref<AnnotationType>(props.editingAnnotation?.type ?? 'image')
const textContent = ref(props.editingAnnotation?.content ?? '')
const assetFilename = ref<string | null>(props.editingAnnotation?.assetFilename ?? null)
const previewUrl = ref<string | null>(null)

const canSave = computed(() => {
  if (selectedType.value === 'image') return assetFilename.value !== null
  if (selectedType.value === 'audio') return assetFilename.value !== null
  return textContent.value.trim().length > 0
})

onMounted(() => {
  dialogRef.value?.showModal()
  // NOTE: annotation dialog IS dismissible — no e.preventDefault() on cancel
  if (props.editingAnnotation?.assetFilename && props.editingAnnotation.type === 'image') {
    window.api.getAssetsDir().then((dir) => {
      previewUrl.value = `file://${dir}/${props.editingAnnotation!.assetFilename}`
    })
  }
})

async function pickImage(): Promise<void> {
  const filePath = await window.api.openFile([
    { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
  ])
  if (!filePath) return
  assetFilename.value = await window.api.copyAsset(filePath)
  const assetsDir = await window.api.getAssetsDir()
  previewUrl.value = `file://${assetsDir}/${assetFilename.value}`
}

async function pasteImage(): Promise<void> {
  try {
    const items = await navigator.clipboard.read()
    for (const item of items) {
      const imageType = item.types.find((t) => t.startsWith('image/'))
      if (imageType) {
        const blob = await item.getType(imageType)
        const buffer = await blob.arrayBuffer()
        const ext = imageType.split('/')[1] ?? 'png'
        assetFilename.value = await window.api.saveBlobAsset(buffer, ext)
        const assetsDir = await window.api.getAssetsDir()
        previewUrl.value = `file://${assetsDir}/${assetFilename.value}`
        return
      }
    }
  } catch (err) {
    console.error('[AnnotationDialog] Clipboard read failed:', err)
  }
}

async function pickAudio(): Promise<void> {
  const filePath = await window.api.openFile([
    { name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'webm'] },
  ])
  if (!filePath) return
  assetFilename.value = await window.api.copyAsset(filePath)
}

async function pasteText(): Promise<void> {
  textContent.value = await navigator.clipboard.readText()
}

function save(): void {
  if (!canSave.value) return
  const annotation: Annotation = {
    id: props.editingAnnotation?.id ?? crypto.randomUUID(),
    wordStartIdx: props.wordStartIdx,
    wordEndIdx: props.wordEndIdx,
    type: selectedType.value,
    content: textContent.value.trim(),
    assetFilename: assetFilename.value,
    createdAt: props.editingAnnotation?.createdAt ?? new Date().toISOString(),
  }
  if (props.editingAnnotation) {
    annotationStore.updateAnnotation(annotation.id, annotation)
  } else {
    annotationStore.addAnnotation(annotation)
  }
  emit('saved', annotation)
  dialogRef.value?.close()
}
</script>

<style scoped>
/* CSS Anchor Positioning — dialog anchors to --selection-end set on last selected word */
.annotation-dialog {
  border: none;
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
  padding: 0;
  width: 320px;
  position: fixed;
  position-anchor: --selection-end;
  inset-area: top span-inline-end;
  position-try-fallbacks: bottom span-inline-end, top, bottom;
  margin: 8px;
}
.annotation-dialog::backdrop {
  background: transparent;
}
.annotation-dialog__content { padding: 20px; }
.annotation-dialog__title {
  font-size: 0.95rem;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 14px;
}
.annotation-dialog__types {
  display: flex;
  gap: 6px;
  margin-bottom: 14px;
}
.type-btn {
  flex: 1;
  padding: 5px 8px;
  border: 1px solid #d1d5db;
  border-radius: 5px;
  background: white;
  font-size: 0.8rem;
  cursor: pointer;
}
.type-btn--active {
  background: #1a56db;
  color: white;
  border-color: #1a56db;
}
.annotation-dialog__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 14px;
}
.annotation-dialog__preview {
  max-width: 100%;
  max-height: 120px;
  object-fit: contain;
  border-radius: 4px;
  border: 1px solid #e5e7eb;
}
.annotation-dialog__filename {
  font-size: 0.8rem;
  color: #374151;
  background: #f3f4f6;
  padding: 6px 10px;
  border-radius: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.annotation-dialog__textarea {
  width: 100%;
  padding: 8px;
  border: 1px solid #d1d5db;
  border-radius: 5px;
  font-size: 0.875rem;
  resize: vertical;
  box-sizing: border-box;
}
.annotation-dialog__input {
  width: 100%;
  padding: 8px;
  border: 1px solid #d1d5db;
  border-radius: 5px;
  font-size: 0.875rem;
  box-sizing: border-box;
}
.annotation-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.annotation-dialog__actions-row { display: flex; gap: 8px; flex-wrap: wrap; }
.btn-primary {
  padding: 7px 18px;
  background: #1a56db;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
}
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary:hover:not(:disabled) { background: #1345b7; }
.btn-secondary {
  padding: 7px 14px;
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.875rem;
}
.btn-secondary:hover { background: #e5e7eb; }
</style>
