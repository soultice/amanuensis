---
plan: 17-01
phase: 17
status: complete
completed: "2026-04-16"
---

# Summary: Plan 17-01 — Extend CI to Linux and Windows

## What Was Done

Rewrote `.github/workflows/build.yml` from a macOS-only build job into a matrix workflow that builds on all three platforms:

- **ubuntu-latest** → AppImage
- **windows-latest** → NSIS installer (`.exe`)
- **macos-latest** → DMG + ZIP

Key decisions:
- `fail-fast: false` ensures a failure on one OS doesn't cancel the others
- `timeout-minutes: 90` accommodates slow PyInstaller + electron-builder runs
- Poetry is installed via the official script on Linux/macOS and via PowerShell on Windows
- Linux system packages (`libasound2-dev`, `libgtk-3-dev`, etc.) are installed for audio and Electron native module support
- `CSC_IDENTITY_AUTO_DISCOVERY: false` on macOS prevents code-signing CI failures
- Node pinned to `22`, Python to `3.12` (satisfies `>=3.10,<3.15`)

## Key Files

### key-files.modified
- `.github/workflows/build.yml`

## Verification Results

All acceptance criteria passed:
- `grep -c "ubuntu-latest"` → 1 ✓
- `grep -c "windows-latest"` → 1 ✓
- `grep -c "macos-latest"` → 1 ✓
- `grep -c "AppImage"` → 3 ✓
- `grep -c "\.exe"` → 1 ✓
- `grep -c "\.dmg"` → 1 ✓
- `grep -c "fail-fast: false"` → 1 ✓
- `grep -c "upload-artifact"` → 4 ✓

## Commits

- `ci(phase-17): extend build workflow to Linux, Windows, and macOS matrix`

## Self-Check: PASSED
