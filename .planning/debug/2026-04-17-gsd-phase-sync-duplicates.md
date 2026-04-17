---
created: 2026-04-17T10:20:19.726Z
issue: duplicated roadmap phases and plan directories caused by GSD sync drift
type: integration
phase: 19
status: resolved
---

## Root Cause
The project-local GSD assets are in a mixed-version state: workflow files advertise and use `v2.1.1`, while `.pi/gsd/VERSION`, `.pi/gsd-file-manifest.json`, and hook headers still report `1.30.0`. That partial sync let newer WXP-driven phase-add behavior coexist with stale project metadata, and repeated phase-add executions accumulated duplicate roadmap entries and duplicate phase directories instead of preserving a single canonical phase.

## Fix
- Pruned duplicate roadmap entries from `.planning/ROADMAP.md`
- Restored canonical follow-up phases to Phase 18, Phase 19, and Phase 20 only
- Updated Phase 19 to reflect real planned/executed state and Phase 20 to depend on Phase 19 instead of a phantom duplicate chain
- Corrected `.planning/STATE.md` progress counters and roadmap evolution notes to the de-duplicated set
- Recorded the duplicate families removed: installability clones, Parakeet clones, and live-transcription clones

## Verification
- `pi-gsd-tools roadmap analyze --raw` should no longer report duplicate phase families for the same description
- `.planning/ROADMAP.md` now contains one Parakeet phase (18), one live-transcription phase (19), and one follow-up removal phase (20)
- `.planning/STATE.md` progress now matches the de-duplicated roadmap (`20` phases, `43` plans)
- Manual repo inspection confirms the sync drift symptom: workflows at `2.1.1` but `.pi/gsd/VERSION` and hook headers at `1.30.0`
