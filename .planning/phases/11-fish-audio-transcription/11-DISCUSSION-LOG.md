# Phase 11: Fish Audio S2 Pro Transcription Backend — Discussion Log

**Phase:** 11
**Created:** 2026-04-13

---

## 2026-04-13 — Phase added

**Decision:** Replace the local faster-whisper transcription backend with Fish Audio
cloud ASR (`POST /v1/asr`).

**Rationale:**
- Fish Audio S2 Pro offers high-accuracy transcription across 50+ languages without
  requiring a local GPU or a large model download (~3 GB for Whisper large-v3)
- Eliminates the model-download onboarding step entirely
- Reduces local resource requirements (no Python sidecar, no VRAM needed)

**Key constraint identified:** Fish Audio ASR returns segment-level timestamps only.
Word-level timestamps (required by Amanuensis's word-click navigation) must be
synthesised via uniform distribution within each segment. This is an approximation
but preserves the full word-click UX.

**Open questions for planning:**
1. Pricing — Fish Audio bills per second of audio transcribed. Need to surface cost
   estimate to user or warn on long recordings.
2. Segment granularity — typical segment length in Fish Audio output. Shorter segments
   → better word-timestamp approximation.
3. `ignore_timestamps=false` — does it return anything more granular than segments?
   Worth testing empirically during planning.
4. Sidecar removal completeness — the health check polling on startup assumes a sidecar.
   The `AppStatusBar` showing "Sidecar: ready" needs updating or removing.
5. Fallback strategy — should the app work offline at all? (Answer per D-05: no, error
   state with retry.)

