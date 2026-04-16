# Contributing to Amanuensis

Thank you for contributing! This guide covers platform-specific setup for macOS, Windows,
and Linux — both for running the app in development and for building distributable packages.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 18 (tested on 22) | Install via [nvm](https://github.com/nvm-sh/nvm), [fnm](https://github.com/Schniz/fnm), or [Volta](https://volta.sh/) |
| npm | ≥ 8 (tested on 11) | Bundled with Node.js |
| Python | ≥ 3.10, < 3.15 | Use [pyenv](https://github.com/pyenv/pyenv) on macOS/Linux, or [python.org](https://python.org) on Windows |
| Poetry | ≥ 1.8 | [Installation instructions below](#installing-poetry) |
| Git | Any recent | — |
| ffmpeg | Any recent | Required for WebM → WAV conversion before Parakeet inference |

## Installing Poetry

### macOS / Linux

```bash
curl -sSL https://install.python-poetry.org | python3 -
# Add to PATH (add this to your shell profile: ~/.bashrc, ~/.zshrc, etc.)
export PATH="$HOME/.local/bin:$PATH"
```

### Windows (PowerShell)

```powershell
(Invoke-WebRequest -Uri https://install.python-poetry.org -UseBasicParsing).Content | python -
# The installer prints the path to add — typically:
# C:\Users\<you>\AppData\Roaming\pypoetry\venv\Scripts
# Add it to your user PATH via System Properties → Environment Variables
```

Verify: `poetry --version` should print a version string.

## Development Setup

### 1. Clone and install Node dependencies

```bash
git clone <repo-url>
cd amanuensis-the-second
npm install
```

### 2. Install Python sidecar dependencies

```bash
cd sidecar
poetry install
cd ..
```

### 3. Run in development mode

```bash
npm run dev
```

Electron opens with hot-reload. The Python sidecar is spawned automatically via Poetry.

> **First launch:** The app will prompt you to download the NVIDIA Parakeet ONNX model (~600MB).
> This only happens once; the model is cached in your OS user-data directory.

---

### Platform-specific notes

#### macOS

- No extra system packages needed.
- Audio recording uses the default microphone — grant permission when the OS prompts.
- If you build a `.dmg` locally, macOS will quarantine it. Right-click → Open to bypass Gatekeeper on first launch.

#### Windows

**Poetry discovery:** The dev-mode sidecar launcher automatically searches these paths for `poetry.exe`:
- `%APPDATA%\pypoetry\venv\Scripts` (official installer)
- `%APPDATA%\Python\Scripts` (pip-based install)
- `%LOCALAPPDATA%\Programs\Python\Scripts`

If `npm run dev` fails with `spawn poetry.exe ENOENT`, check that `poetry --version` works
in a fresh terminal. If yes, `poetry.exe` is installed but not on the PATH that Electron
inherits. Add its directory to your **system** PATH (not just the terminal session).

**Line endings:** The repo uses LF. Set `git config core.autocrlf false` before cloning to
avoid carriage-return issues in shell scripts.

**Node.js:** Use the LTS installer from [nodejs.org](https://nodejs.org). Ensure the installer
adds Node and npm to your system PATH (the installer checkbox is checked by default).

#### Linux

**Audio:** The app uses the browser's `MediaDevices.getUserMedia` API. On most distributions
this works out of the box. If audio capture fails, check:

```bash
# PulseAudio / PipeWire running?
pactl info | grep "Server Name"
# Browser-level permission (Electron uses Chromium under the hood)
```

**AppImage:** The packaged `.AppImage` requires FUSE to run. Install it if missing:

```bash
# Ubuntu / Debian
sudo apt-get install fuse libfuse2
# Fedora / RHEL
sudo dnf install fuse fuse-libs
```

**Sandbox:** Electron runs with `sandbox: true` in the renderer. If you see crashes on
Linux, try running the AppImage with `--no-sandbox` as a diagnostic (not a fix for production).

---

## Building Distributable Packages

Building requires PyInstaller (not listed in dev deps — install once into the Poetry env):

```bash
cd sidecar
poetry run pip install pyinstaller
cd ..
```

Then:

```bash
# Build everything at once
npm run build:all

# Or step by step:
npm run build:sidecar   # PyInstaller → dist-sidecar/amanuensis-sidecar/
npm run build           # Vite → out/
npm run build:electron  # electron-builder → release/
```

| Platform | Output | Location |
|---|---|---|
| macOS | `.dmg` + `.zip` | `release/` |
| Windows | `.exe` (NSIS) | `release/` |
| Linux | `.AppImage` | `release/` |

> **Build on the target platform.** PyInstaller produces platform-specific binaries.
> For automated multi-platform builds, see `.github/workflows/build.yml`.

## Continuous Integration

Every push to `main` and every pull request triggers the CI workflow
(`.github/workflows/build.yml`), which builds and packages the app on:
- `ubuntu-latest` → AppImage
- `windows-latest` → NSIS installer
- `macos-latest` → DMG + ZIP

Artifacts are uploaded and retained for 14 days.

## Code Style

- **TypeScript**: no explicit `any`, strict mode on
- **Vue 3**: Composition API + `<script setup>` syntax
- **Python**: standard library + Poetry-managed deps; no `print()` in production paths

## Running Tests

```bash
# TypeScript type check
npm run typecheck

# Python sidecar tests
cd sidecar && poetry run pytest
```

## Questions?

Open an issue or start a discussion in the repository.
