# Phase 8: Session Management - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Allow users to maintain multiple transcript sessions. The app opens to a session list
(full-screen). From the list the user can open any existing session or create a new one.
From inside a session the user can return to the list. Creating/annotating/exporting
within a session is unchanged — this phase is purely about the session lifecycle.

</domain>

<decisions>
## Implementation Decisions

### App entry point
- **D-01:** App always opens to the session list view, not directly into a session.
- **D-02:** Exception: if there are zero sessions (first launch), skip the list and
  drop straight into a new session (auto-created, no prompt).

### Session naming
- **D-03:** Sessions are auto-named from creation timestamp in sortable format:
  `"2026-04-13 11:42"`. No user rename — names are fixed at creation.

### Session list UI
- **D-04:** Full-screen view — completely replaces the editor (AppShellView). The app
  has two top-level views: `SessionListView` and `AppShellView`. Routing is controlled
  by a new `activeView: 'list' | 'editor'` state (not a router — simple reactive ref
  in App.vue or a new `sessionNav` store).
- **D-05:** Session list shows each session as a card/row: name (timestamp), word
  count or snippet, last-saved time.
- **D-06:** Prominent "New Session" button on the list. Each session row has an
  "Open" action.

### Closing a session (returning to list)
- **D-07:** "← Sessions" button in AppToolbar. Blocked (disabled + tooltip) while
  recording is in progress — user must stop recording first.
- **D-08:** On close: save session to disk, reset all stores (transcript, annotations,
  recording, playback), then switch view to `'list'`.

### Per-session storage
- **D-09:** Each session lives in its own directory:
  `userData/sessions/{uuid}/session.json`
  `userData/sessions/{uuid}/assets/`
- **D-10:** A top-level index file tracks all sessions:
  `userData/sessions/index.json` — array of `{ id, name, createdAt, updatedAt, wordCount }`.
  Updated on every save and on create/delete.
- **D-11:** Migration: on first Phase 8 launch, if the legacy `current.json` exists,
  it is migrated into a new session folder automatically and removed.

### IPC surface changes
- **D-12:** New IPC handlers needed:
  - `session:list` → returns `index.json` contents
  - `session:create` → creates a new `{uuid}/` directory + empty `session.json`,
    appends to index, returns the new session id
  - `session:open` → reads `{id}/session.json`, returns raw JSON string
  - `session:delete` → removes `{id}/` directory, removes from index
- **D-13:** Existing handlers updated:
  - `session:save` now takes `{ id, data }` — writes to `{id}/session.json` with
    existing atomic rename logic; updates `updatedAt` and `wordCount` in index
  - `session:load` is removed (replaced by `session:open`)
  - `session:copyAsset`, `session:saveBlobAsset`, `session:getAssetsDir` — all now
    take a `sessionId` parameter and resolve into `{id}/assets/`

### Store changes
- **D-14:** `session.ts` store gains:
  - `currentSessionId: string | null` state
  - `createSession()` action — calls `session:create`, sets `currentSessionId`
  - `openSession(id)` action — calls `session:open`, restores data, sets `currentSessionId`
  - `closeSession()` action — saves, resets all stores, clears `currentSessionId`
  - `listSessions()` action — calls `session:list`
- **D-15:** `save()` passes `currentSessionId` in the payload. Auto-save and
  save-on-close remain but are no-ops when `currentSessionId` is null (on list view).

### the agent's Discretion
- Session list visual design (card vs row, exact typography)
- Empty session list illustration or icon
- Exact transition animation between list and editor views (or none)
- Session delete UX (button position, confirmation dialog or not)
- Word count calculation method for the index

</decisions>

<specifics>
## Specific Ideas

- No specific product references — standard list UI is fine.
- "2026-04-13 11:42" sortable format preferred over "Apr 13, 2026 — 11:42".
- First launch with no sessions → skip list, auto-create and enter a session immediately.
- Close button blocked (not hidden) while recording — user sees why they can't leave.

</specifics>

<canonical_refs>
## Canonical References

No external specs or ADRs. Requirements are fully captured in decisions above.

### Existing session persistence (must read before touching)
- `src/renderer/src/stores/session.ts` — full Phase 4 session store: `buildSessionData()`,
  `save()`, `restore()`, `startAutoSave()`, `registerSaveOnClose()`; all need updates
- `src/main/index.ts` §254–310 — all `session:*` IPC handlers; all need updates
- `src/renderer/src/views/AppShellView.vue` — `onMounted` calls `restore()` / `startAutoSave()` /
  `registerSaveOnClose()`; close button and reset logic added here
- `src/renderer/src/components/AppToolbar.vue` — receives `isTranscribing` prop; needs
  new `"← Sessions"` button wired to close action, disabled while recording
- `src/renderer/src/App.vue` — top-level view switcher; add `SessionListView` branch
  alongside existing `OnboardingView` / `AppShellView`

### Asset handlers (all need sessionId parameter)
- `src/main/index.ts` §231–252 — `session:copyAsset`, `session:saveBlobAsset`,
  `session:getAssetsDir`; currently hardcoded to shared `sessions/assets/`
- `src/renderer/src/components/AnnotationPanel.vue` §107–115 — calls
  `window.api.getAssetsDir()`; will need to pass session id or the store handles it

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SessionData` interface in `session.ts` — already serialises the full session;
  the shape is fine, just needs to move from `current.json` to `{id}/session.json`
- Atomic rename logic in `session:save` — keep exactly as-is, just change the target path
- `restore()` in `session.ts` — becomes `openSession(id)` with the same body

### Established Patterns
- Two-view switch already exists (`OnboardingView` vs `AppShellView` in `App.vue`) —
  `SessionListView` slotting in follows the same pattern
- `v-if` routing in `App.vue` — no Vue Router; keep the same approach for list vs editor

### Integration Points
- `session:copyAsset` / `session:saveBlobAsset` called from `AnnotationDialog.vue` when
  user attaches an image or audio clip — these must receive a session id to write into
  the correct `{id}/assets/` folder
- `window.api.getAssetsDir()` called in `AnnotationPanel.vue` export — must return the
  active session's asset dir, not the shared one
- `registerSaveOnClose` / `onSaveAndQuit` flow in `session.ts` — save-on-quit must use
  `currentSessionId`; behaviour when on list view (no active session) should be a
  clean no-op quit

</code_context>

<deferred>
## Deferred Ideas

- Session renaming — not in scope; names are fixed at creation
- Session deletion — agent's discretion whether to include; not explicitly requested
- Session search/filter — backlog
- Session export directly from list — backlog

</deferred>

---

*Phase: 08-session-management*
*Context gathered: 2026-04-13*
