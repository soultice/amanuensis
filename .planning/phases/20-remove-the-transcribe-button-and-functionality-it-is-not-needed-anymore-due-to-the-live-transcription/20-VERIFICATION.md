---
phase: 20
status: passed
verified: "2026-04-17"
verifier: inline
---

# Verification: Phase 20 — Remove Transcribe Button

## Phase Goal

Remove the legacy manual transcribe affordance now that live transcription owns the recording-to-transcript flow, while preserving transcript completion and transcript-navigation contracts through internal recovery.

## Automated Checks

| Check | Result |
|---|---|
| `npm run typecheck:web` | ✓ PASS |
| `npm run typecheck:node` | ✓ PASS |
| `npm run typecheck` | ✓ PASS |
| `npm run build` | ✓ PASS |
| `cd sidecar && poetry run pytest tests/test_live_transcription_integration.py -q` | ✓ PASS (3 tests) |
| `rg -n "toolbar__btn--transcribe|@transcribe|click <strong>Transcribe</strong>|Transcribe first|Live:" src/renderer/src` | ✓ PASS (no stale visible affordance/copy matches) |

## Must-Haves (Code + Tests)

| Must-have | Evidence | Status |
|---|---|---|
| Visible Transcribe affordance removed | `src/renderer/src/components/AppToolbar.vue`, `src/renderer/src/views/AppShellView.vue` no longer expose or handle `transcribe` UI wiring | ✓ PASS |
| Transcript recovery remains available behind the scenes | `src/renderer/src/stores/transcript.ts` adds `recoverTranscriptFromAudio(audioBlob)` using `POST /transcribe` | ✓ PASS |
| Live-unavailable and stop-failure recordings still recover to final transcript schema | `src/renderer/src/stores/recording.ts` triggers hidden recovery after missing live session or failed `stopLiveSession()` | ✓ PASS |
| Restored sessions with saved audio and missing transcript are handled explicitly | `src/renderer/src/stores/session.ts`, `src/preload/index.ts`, `src/main/index.ts`, `src/renderer/src/env.d.ts` add `readSessionAsset(...)` and restore-time recovery/error path | ✓ PASS |
| Final transcript contract for navigation/annotation remains intact | Recovery assigns `words`, `segments`, `language`, and `duration`; app build + existing live integration tests pass | ✓ PASS |
| User-facing copy matches live-first workflow | `TranscriptPanel.vue`, `AnnotationPanel.vue`, `AppStatusBar.vue` use live-first/recovery wording with no stale `Transcribe` button instructions | ✓ PASS |

## Notes

- Human smoke-check remains optional for this phase. The automated/build checks passed, and the phase does not introduce a new interaction model beyond removing the obsolete affordance.
- The batch `/transcribe` route is intentionally retained as an internal recovery mechanism rather than a user-visible action.

## Result

Automated verification passed. Phase 20 implementation satisfies the planned cleanup while preserving transcript completion and transcript-navigation behavior through hidden recovery.
