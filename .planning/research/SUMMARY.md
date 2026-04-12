# Research Summary: Amanuensis

*Synthesized: 2026-04-12*

## TL;DR

Build with **electron-vite + Vue 3 + TypeScript** for the desktop shell, **faster-whisper** (not openai-whisper) for transcription, and **FastAPI + PyInstaller** for the Python sidecar. The stack is well-validated, the main risks are Whisper's speed on CPU and Python sidecar cross-platform packaging — both manageable with known patterns.

---

## Stack (Prescriptive)

| Layer | Choice | Version |
|---|---|---|
| Desktop shell | Electron | ^33 |
| Build tool | electron-vite | ^2 |
| Packager | electron-builder | ^25 |
| UI framework | Vue 3 + TypeScript | ^3.5 / ^5.6 |
| State | Pinia | ^2.2 |
| Waveform | wavesurfer.js + @meersagor/wavesurfer-vue | ^7 / ^2.0 |
| Python API | FastAPI + uvicorn | ^0.115 / ^0.32 |
| Transcription | faster-whisper | ^1.1 |
| Python packaging | PyInstaller | ^6.15 |
| Session storage | JSON files in userData | — |

---

## Table Stakes for This Domain

All of these must exist for the tool to feel complete:

1. **Audio device selection** — users have multiple mics
2. **Record / stop with real-time level meter** — without feedback, users think it's broken
3. **Transcription progress indicator** — large model is slow; silence = perceived crash
4. **Clickable words → audio seek** — the core interaction of any transcription tool
5. **Auto-save** — recordings are irreplaceable; data loss is unforgivable
6. **Session restore** — users return to annotate; starting over is a dealbreaker

---

## Key Architectural Decisions

- **Word indices are the source of truth** for annotation positions (not character offsets, not timestamps)
- **Renderer calls Python sidecar directly via HTTP** — routing audio files through Electron IPC causes serialization overhead
- **Python sidecar is stateless** — all session state lives in the Electron layer
- **Atomic writes** for session.json — write to `.tmp`, then `fs.rename()` to prevent corruption
- **Model weights downloaded on first run** to `userData/models/` — not bundled (3GB too large)

---

## Watch Out For

| Risk | Severity | Mitigation |
|---|---|---|
| Whisper large-v3 is slow on CPU (3–5× real time) | High | Show progress + time estimate; do not block UI |
| PyInstaller bundling differs per platform | High | CI builds for macOS arm64/x86_64, Windows, Linux separately |
| MediaRecorder outputs WebM; Whisper needs WAV | High | Convert in Python sidecar before transcription |
| macOS microphone permission requires entitlements | High | Add entitlements in Phase 2, test on real hardware |
| Word timestamps can drift ±200ms | Medium | Add 50ms pre-roll on seek; document as known limitation |
| CSS anchor dialog clips on scroll | Medium | Use `position-try-fallbacks`; test with long transcripts |
| Auto-save corruption on force-quit | Medium | Atomic rename pattern + 3-file backup rotation |
| `contextIsolation` violated in renderer | High | Use preload.ts + contextBridge from day one (electron-vite does this) |

---

## Build Order Recommendation

Derived from feature dependency chain — each phase unlocks the next:

```
Phase 1 — Foundation
  Electron scaffold + Python sidecar + IPC bridge + health check

Phase 2 — Audio & Transcription  
  Device selection + recording + level meter + transcription + progress UI

Phase 3 — Transcript + Waveform
  Word rendering + WaveSurfer + click-to-seek + word range selection + region highlight

Phase 4 — Annotations + Persistence
  CSS anchor dialog + annotation CRUD + non-overlap + session save/restore

Phase 5 — Export + Packaging
  Markdown export + asset copy + PyInstaller + electron-builder + CI
```

---

## Files

- `STACK.md` — full library list with versions and rationale
- `FEATURES.md` — table stakes vs differentiators vs anti-features
- `ARCHITECTURE.md` — component map, IPC patterns, data flow, session model
- `PITFALLS.md` — 8 specific pitfalls with prevention strategies and phase mapping
