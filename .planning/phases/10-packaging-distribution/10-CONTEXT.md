# Phase 10: Packaging & Distribution — Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Produce a single, self-contained distributable installer for each platform (macOS `.dmg`, Windows NSIS `.exe`, Linux `.AppImage`) that ships the Electron renderer + main process **and** the Python sidecar binary in one download. The Whisper model is **not** bundled — it is downloaded on first launch as it is today. No user needs Python, Node, or any runtime installed.

### What "single bundle" means

On macOS: one `.dmg` containing an `.app` that embeds the sidecar under `Contents/Resources/sidecar/`.
On Windows: one NSIS `.exe` installer.
On Linux: one `.AppImage`.

The Python sidecar is frozen with PyInstaller (COLLECT mode) and included as `extraResources`. The Electron app already knows how to find and launch it at `{resourcesPath}/sidecar/amanuensis-sidecar`.

### What is NOT changing

- No new runtime dependencies — PyInstaller freezes everything Python
- Model download and storage in `app.getPath('userData')` is unchanged
- All IPC, stores, and business logic are unchanged
- No auto-update mechanism in this phase
</domain>

<decisions>
## Implementation Decisions

### D-01: PyInstaller target mode — COLLECT (directory bundle)
Keep COLLECT mode (not `--onefile`). Onefile extracts to a temp dir on every launch, which adds 5–15 s startup time for a large bundle like faster-whisper + ctranslate2. COLLECT mode keeps the binary and its shared libs in a flat directory, which electron-builder copies wholesale into `extraResources`.

### D-02: Sidecar resource path
`{app.resourcesPath}/sidecar/amanuensis-sidecar` — already correct in `sidecar.ts`.
The `extraResources` rule `{ from: "dist-sidecar/amanuensis-sidecar", to: "sidecar" }` copies the COLLECT output correctly.

### D-03: App icon
A single 1024×1024 source PNG (`build/icon.png`) is used to derive all platform-specific formats:
- macOS: `build/icon.icns` (generated from PNG via `iconutil` or `electron-icon-maker`)
- Windows: `build/icon.ico` (generated)
- Linux: `build/icon.png` (used directly)
electron-builder's `icon` field points to `build/icon.png` and it auto-converts (or we generate the platform-specific files during the build).

### D-04: macOS entitlements
Both `entitlements` (Electron main process) and `entitlementsInherit` (child processes, including the PyInstaller sidecar) must be set. They both point to the same `build/entitlements.mac.plist` which already includes `com.apple.security.device.microphone` and `com.apple.security.cs.allow-jit`.

### D-05: macOS target
`dmg` is the shipping target. `zip` is added alongside so the app can be distributed as a simple zip for direct download / sideloading when no code signing key is available.

### D-06: Code signing
Code signing is **optional** for a personal / internal build. When `CSC_LINK` / `CSC_KEY_PASSWORD` env vars are absent, electron-builder skips signing automatically. The phase does not require a signing certificate. The config is signing-ready but signing is not a success criterion.

### D-07: PyInstaller hidden imports (ARM64 / Apple Silicon)
ctranslate2 and faster-whisper have complex native extension imports. The existing `hiddenimports` list in the spec covers the core uvicorn/fastapi stack. We extend it with the ctranslate2 / faster-whisper internals that the ARM64 analysis step may miss.

### D-08: Build reproducibility
`npm run build:all` must complete successfully and produce an artifact under `release/`. The sidecar must start and respond to `GET /health` when launched from the packaged app path.

### D-09: CI (GitHub Actions) — included in scope
A single `.github/workflows/build.yml` that builds on `macos-latest` (arm64), runs `build:all`, and uploads the `.dmg` artifact. Windows and Linux builds can be added later; macOS is the primary target.
</decisions>

<gaps>
## Current Build Gaps

| # | Gap | Severity | Fix |
|---|-----|----------|-----|
| G-01 | No app icon files (`build/icon.icns`, `build/icon.ico`, `build/icon.png`) | High — build may fail or use generic icon | Create icon files |
| G-02 | `entitlements` missing from mac build config (only `entitlementsInherit`) | Medium — unsigned builds work; signed builds may fail | Add `entitlements` key |
| G-03 | macOS `target` not explicit | Low | Add `target: ["dmg","zip"]` |
| G-04 | PyInstaller hidden imports may be incomplete on ARM64 | High — sidecar may crash on first launch | Audit + extend spec |
| G-05 | No GitHub Actions workflow | Medium | Create `.github/workflows/build.yml` |
| G-06 | No `build:electron` / `build:all` smoke test ever run | High — unknown if pipeline works | Run end-to-end |
| G-07 | `dist-sidecar/` absent (never built) | High | Build sidecar first |
</gaps>

<plan_outline>
## Plan Wave Structure

### Wave 1 (sequential)
- **10-01** — App icon + electron-builder config audit

### Wave 2 (depends on 10-01)
- **10-02** — PyInstaller spec hardening: hidden imports, ARM64 fixes, build + verify binary runs

### Wave 3 (depends on 10-02)
- **10-03** — Electron main process hardening: production sidecar path, CSP, logging

### Wave 4 (depends on 10-03)
- **10-04** — End-to-end build smoke test + GitHub Actions CI
</plan_outline>

---

*Phase: 10-packaging-distribution*
*Context gathered: 2026-04-13*
