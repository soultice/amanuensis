# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 01-foundation
**Areas discussed:** First-run experience, App shell structure, Sidecar failure handling, Python dev setup

---

## First-Run Experience

| Option | Description | Selected |
|---|---|---|
| Silent auto-download | Model downloads in background on first launch with no explicit setup screen | |
| Setup/onboarding screen with status | Dedicated screen showing model status (ready, downloading, missing) with user-initiated download | ✓ |
| Manual setup outside app | User installs model separately before launching | |

**User's choice:** Setup/onboarding screen with model status tracking — "User should see a setup/onboarding screen and be able to track the status of the model (is it already there, is it downloading, is it missing etc)"

**Notes:** App must not proceed to main shell until model is confirmed ready. Status tracking is a first-class requirement of the onboarding screen.

---

## App Shell Structure

| Option | Description | Selected |
|---|---|---|
| Minimal branded loading screen | Simple spinner / "connecting…" while sidecar starts, no layout scaffolding | |
| Full layout scaffold | Entire final app layout (toolbar, main panel, status bar) built now, panels empty/disabled | ✓ |
| Incremental per-phase | Each phase adds its own layout section | |

**User's choice:** Scaffold the entire view — "scaffold the entire view"

**Notes:** Phase 1 delivers the full shell layout. Subsequent phases wire in features within the established structure.

---

## Sidecar Failure Handling

| Option | Description | Selected |
|---|---|---|
| Non-blocking warning banner | App loads but shows a dismissible warning that sidecar failed | |
| Blocking error dialog | App shows a modal error dialog; user cannot proceed | ✓ |
| Silent auto-retry | App retries sidecar start in background, no user-visible error unless retries exhausted | |

**User's choice:** Blocking error dialog — "If the sidecar fails the app should show a blocking error dialogue"

**Notes:** Dialog should be non-dismissible. Should surface error detail from sidecar stdout/stderr and offer a "Restart App" action.

---

## Python Dev Setup

| Option | Description | Selected |
|---|---|---|
| venv + pip | Standard Python virtual environment, requirements.txt | |
| Poetry | pyproject.toml + poetry.lock, reproducible installs | ✓ |
| conda | Conda environment.yml, common in ML/data science projects | |

**User's choice:** Poetry — "python dev setup must use poetry"

**Notes:** `pyproject.toml` and `poetry.lock` both committed. README must include Poetry setup instructions.

---

## Agent's Discretion

- Visual design of onboarding screen
- Model download implementation (faster-whisper download API, temp file handling)
- Error dialog component
- Status bar content and styling
- Sidecar port discovery mechanism

## Deferred Ideas

None.
