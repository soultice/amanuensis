---
plan: 16-01
phase: 16
status: complete
completed: "2026-04-16"
---

# Summary: Plan 16-01 — Make project installable on any machine

## What Was Done

Three targeted changes to ensure anyone can clone and `npm install` without hitting a corporate Artifactory registry:

1. **Created `.npmrc`** — pins `registry=https://registry.npmjs.org/`, overriding any user-level `~/.npmrc` (e.g. Mercedes-Benz Artifactory) automatically when npm runs inside the project directory.

2. **Updated `package.json`** — added `"npm": ">=8.0.0"` to the `engines` field and added a `"volta"` block pinning `node@22.14.0` and `npm@11.2.0` for Volta users.

3. **Updated `README.md`** — added `npm ≥ 8 (bundled with Node.js; tested on v11)` to the Prerequisites section alongside the existing Node.js, Python, and Poetry entries.

## Key Files

### key-files.created
- `.npmrc`

### key-files.modified
- `package.json`
- `README.md`

## Verification Results

All acceptance criteria passed:
- `.npmrc` contains `registry=https://registry.npmjs.org/` (exactly one line)
- `package.json` engines: `{"node":">=18.0.0","npm":">=8.0.0"}`
- `package.json` volta: `{"node":"22.14.0","npm":"11.2.0"}`
- JSON is valid
- README Prerequisites section includes `**npm** ≥ 8`

## Commits

- `feat(phase-16): add project-level .npmrc pinning public npm registry`
- `feat(phase-16): add npm engine constraint and volta pins to package.json`
- `docs(phase-16): add npm prerequisite to README`

## Self-Check: PASSED
