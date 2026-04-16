---
plan: 17-03
phase: 17
status: complete
completed: "2026-04-16"
---

# Summary: Plan 17-03 — CONTRIBUTING.md with platform-specific setup

## What Was Done

Created `CONTRIBUTING.md` at the project root (177 lines) covering everything a contributor needs to clone and run the app on any OS:

- **Prerequisites table** — Node.js, npm, Python, Poetry, Git with version constraints
- **Poetry installation** — separate commands for macOS/Linux (curl script) and Windows (PowerShell)
- **Development setup** — clone, npm install, poetry install, npm run dev (platform-agnostic)
- **Platform-specific notes:**
  - *macOS*: Gatekeeper workaround for local DMG builds
  - *Windows*: poetry.exe PATH paths, `core.autocrlf false` reminder, ENOENT diagnosis steps
  - *Linux*: PulseAudio/PipeWire check, FUSE requirement for AppImage
- **Build pipeline** — PyInstaller → Vite → electron-builder, step-by-step and all-at-once commands
- **CI reference** — links to `.github/workflows/build.yml` for the matrix build
- **Code style and tests** — TypeScript rules, Vue 3 Composition API, pytest for the sidecar

Also added a "New contributor?" callout to the `## Development Setup` section of `README.md` linking to `CONTRIBUTING.md`.

## Key Files

### key-files.created
- `CONTRIBUTING.md`

### key-files.modified
- `README.md`

## Verification Results

All acceptance criteria passed:
- `grep -c "Windows" CONTRIBUTING.md` → 5 ✓
- `grep -c "Linux" CONTRIBUTING.md` → 6 ✓
- `grep -c "macOS" CONTRIBUTING.md` → 6 ✓
- `grep -ic "poetry" CONTRIBUTING.md` → 16 ✓
- `grep -c "AppImage" CONTRIBUTING.md` → 4 ✓
- `grep -c "pypoetry" CONTRIBUTING.md` → 2 ✓
- `grep -c "build.yml" CONTRIBUTING.md` → 2 ✓
- `wc -l CONTRIBUTING.md` → 177 ✓
- `grep -c "CONTRIBUTING.md" README.md` → 1 ✓

## Commits

- `docs(phase-17): add CONTRIBUTING.md with platform-specific setup guide; link from README`

## Self-Check: PASSED
