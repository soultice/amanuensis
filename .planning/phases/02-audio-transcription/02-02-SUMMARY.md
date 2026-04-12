# Plan 02-02 Summary: Transcription Pipeline

**Status:** Complete
**Completed:** 2026-04-12

## What Was Built

Python FastAPI `/transcribe` endpoint with `WhisperModel` singleton (thread-safe double-checked locking, loaded lazily on first request). `asyncio.Lock` ensures one transcription at a time. `transcribe_file()` uses `word_timestamps=True`, `language=None` (auto-detect), `vad_filter=True`. PyAV (already installed) handles WebM natively. `useTranscriptStore` (Pinia) manages the full client-side pipeline: FormData POST, polling heartbeat, state machine (`empty→transcribing→complete|error`), `fullText` getter joining words as flowing paragraph. `TranscriptPanel.vue` shows inline spinner with honest "may take a few minutes" message while transcribing, then flowing text with word count/language/duration metadata on completion. `AppShellView.vue` wired with real `useTranscriptStore`.

## Key Files

- `sidecar/app/services/transcription.py` — WhisperModel singleton + transcribe_file()
- `sidecar/app/routes/transcribe.py` — GET /transcribe/status, POST /transcribe
- `sidecar/app/state.py` — transcription_status added
- `src/renderer/src/stores/transcript.ts` — useTranscriptStore
- `src/renderer/src/components/TranscriptPanel.vue` — inline progress + flowing text
- `src/renderer/src/views/AppShellView.vue` — wired to transcriptStore

## Verified

- `GET /transcribe/status` → `{"state":"idle","progress":0,"error":null}` ✓
- Python imports clean ✓
- TypeScript clean ✓

## Self-Check: PASSED

TRANS-01–04 all addressed. All acceptance criteria met.
