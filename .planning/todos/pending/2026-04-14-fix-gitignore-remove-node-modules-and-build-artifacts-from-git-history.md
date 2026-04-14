---
created: 2026-04-14T20:18:16.498Z
title: Fix .gitignore and remove node_modules + build artifacts from git history
area: tooling
files:
  - .gitignore
  - .planning/phases/.gitignore
---

## Problem

The git repo is ~198 MiB packed because `node_modules/` (622 MB, 12,765 files) was committed before `.gitignore` was configured. Build artifacts are also partially tracked (37 files including `dist-sidecar/` outputs and `build/icon.icns`).

Confirmed via:
- `git ls-files --cached | grep "node_modules" | wc -l` → 12,765
- `git count-objects -vH` → size-pack: 197.99 MiB
- `git ls-files --cached | grep "dist-sidecar\|build-sidecar\|release/"` → 37 files

Current `.gitignore` correctly lists `node_modules/`, `dist-sidecar/`, `build-sidecar/`, `release/` — but they were already committed before the entry was added, so the entries have no effect on tracked files.

## Solution

1. **Untrack without deleting** (safe — doesn't touch working tree):
   ```bash
   git rm -r --cached node_modules/
   git rm -r --cached dist-sidecar/ build-sidecar/ release/ 2>/dev/null || true
   git rm --cached build/icon.icns build/icon.png 2>/dev/null || true
   ```

2. **Commit the removal:**
   ```bash
   git commit -m "chore: untrack node_modules and build artifacts"
   ```

3. **Optional — rewrite history to shrink repo** (only if repo hasn't been shared widely):
   ```bash
   git filter-repo --path node_modules --invert-paths
   git filter-repo --path dist-sidecar --invert-paths
   git filter-repo --path build-sidecar --invert-paths
   ```
   Then force-push: `git push --force-with-lease`

4. **Verify .gitignore covers all build outputs:**
   - `node_modules/` ✓ (already there)
   - `dist-sidecar/` ✓
   - `build-sidecar/` ✓
   - `release/` ✓
   - `build/icon.icns`, `build/icon.png`, `build/icon.ico` — **add these** (generated files)
   - `out/` ✓
   - `.DS_Store` ✓

5. **Add `build/` generated files to .gitignore** but keep `build/entitlements.mac.plist` tracked (it's hand-authored, not generated).
