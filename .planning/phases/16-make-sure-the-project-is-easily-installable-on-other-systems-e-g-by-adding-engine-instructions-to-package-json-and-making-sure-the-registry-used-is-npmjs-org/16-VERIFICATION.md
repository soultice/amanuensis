---
phase: 16
status: passed
verified: "2026-04-16"
---

# Verification: Phase 16 — Make project installable on any machine

## Goal

Ensure anyone can clone this repo and run `npm install` successfully — even on machines with a corporate npm registry configured globally.

## Must-Haves Verification

### INSTALL-01: Project-level .npmrc overrides corporate registry
- **Status:** ✓ PASSED
- **Evidence:** `.npmrc` exists at project root containing `registry=https://registry.npmjs.org/`
- **Check:** `grep -c "registry=https://registry.npmjs.org/" .npmrc` → 1

### INSTALL-02: npm engine constraint documented in package.json
- **Status:** ✓ PASSED
- **Evidence:** `package.json` engines field contains both `"node": ">=18.0.0"` and `"npm": ">=8.0.0"`; volta field pins `node@22.14.0` and `npm@11.2.0`
- **Check:** `node -e "const p=require('./package.json'); console.log(p.engines)"` → `{"node":">=18.0.0","npm":">=8.0.0"}`

### INSTALL-03: README Prerequisites lists npm version
- **Status:** ✓ PASSED
- **Evidence:** README.md Prerequisites section includes `**npm** ≥ 8 (bundled with Node.js; tested on v11)`
- **Check:** `grep "npm" README.md | grep "≥ 8"` → match found

## Artifacts Verified

| Artifact | Expectation | Result |
|---|---|---|
| `.npmrc` | Contains `registry=https://registry.npmjs.org/` | ✓ Present |
| `package.json` | `engines.npm` = `">=8.0.0"` | ✓ Present |
| `package.json` | `volta.node` = `"22.14.0"` | ✓ Present |
| `README.md` | npm bullet in Prerequisites | ✓ Present |

## Summary

**Score: 3/3 must-haves verified**

All three tasks completed and verified. The project is now installable on any machine regardless of corporate registry configuration.
