---
plan: 17-02
phase: 17
status: complete
completed: "2026-04-16"
---

# Summary: Plan 17-02 — Fix Windows dev mode + electron-builder cross-platform config

## What Was Done

Two targeted fixes for cross-platform compatibility:

**1. `src/main/sidecar.ts` — Windows Poetry PATH detection:**

Replaced the single `~/.local/bin` path addition with a platform-aware list:
- **Windows**: adds `%APPDATA%\pypoetry\venv\Scripts` (official installer), `%APPDATA%\Python\Scripts` (pip-based), and `%LOCALAPPDATA%\Programs\Python\Scripts`
- **macOS/Linux**: adds `~/.local/bin` (unchanged behaviour)

This ensures `poetry.exe` is discoverable in dev mode regardless of how Poetry was installed on Windows.

**2. `package.json` electron-builder config:**

- Added `"category": "AudioVideo"` and `"description"` to the `linux` section — required for the AppImage's `.desktop` file so it appears in the correct system menu category
- Added a `"nsis"` section with `oneClick: false`, `allowToChangeInstallationDirectory: true`, and shortcut creation — gives Windows users a standard install experience with directory choice

## Key Files

### key-files.modified
- `src/main/sidecar.ts`
- `package.json`

## Verification Results

All acceptance criteria passed:
- `grep -c "pypoetry" src/main/sidecar.ts` → 1 ✓
- `grep -c "APPDATA" src/main/sidecar.ts` → 3 ✓
- `grep -c "LOCALAPPDATA" src/main/sidecar.ts` → 1 ✓
- `grep -c "poetryBinPaths" src/main/sidecar.ts` → 2 ✓
- `node -e "...p.build.linux.category"` → `AudioVideo` ✓
- `node -e "...p.build.nsis.oneClick"` → `false` ✓
- `node -e "...p.build.nsis.allowToChangeInstallationDirectory"` → `true` ✓
- TypeScript compilation clean ✓

## Commits

- `fix(phase-17): Windows Poetry PATH detection and cross-platform electron-builder config`

## Self-Check: PASSED
