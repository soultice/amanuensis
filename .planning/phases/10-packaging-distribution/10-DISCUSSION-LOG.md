# Phase 10: Packaging & Distribution — Discussion Log

**Phase:** 10 — Packaging & Distribution
**Opened:** 2026-04-13

---

## 2026-04-13 — Initial scope discussion

**User request:** "I want to be able to bundle and ship this app (excluding the model, that should still be downloaded) but I want a single bundle. We need the sidecar and backend+frontend in a single binary"

**Interpretation:**
- "Single bundle" = one downloadable installer per platform (.dmg / .exe / .AppImage)
- Python sidecar (FastAPI = "backend") + Electron renderer+main ("frontend") all in one installer
- Whisper model remains a runtime download into userData — not bundled
- No PyInstaller onefile needed — COLLECT mode + electron extraResources achieves the "single installer" goal

**Key findings from codebase audit:**
- `build:all` script already chains sidecar→electron build correctly
- sidecar.ts production path is correct (`{resourcesPath}/sidecar/amanuensis-sidecar`)
- extraResources mapping is correct
- Missing: app icon files, `entitlements` in mac config, CI workflow
- PyInstaller spec hidden imports may be incomplete on ARM64

**Decisions recorded in 10-CONTEXT.md**
